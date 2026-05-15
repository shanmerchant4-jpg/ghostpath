import { GhostError } from '../../ghost/errors.js';
const MONTH_NAMES = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const WEEKDAY_NAMES = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};
function parseValue(raw, nameMap) {
    const lower = raw.toLowerCase();
    if (nameMap !== undefined && lower in nameMap)
        return nameMap[lower];
    const n = parseInt(raw, 10);
    if (isNaN(n)) {
        throw new GhostError({
            code: 'INVALID_CRON_VALUE',
            message: `Unrecognised cron field value: "${raw}"`,
            hint: 'Field values must be numbers or recognised name abbreviations (e.g. mon, jan)',
        });
    }
    return n;
}
function expandField(field, min, max, nameMap) {
    const result = new Set();
    for (const part of field.split(',')) {
        if (part === '*') {
            for (let v = min; v <= max; v++)
                result.add(v);
            continue;
        }
        const slashIdx = part.indexOf('/');
        if (slashIdx !== -1) {
            const rangeStr = part.slice(0, slashIdx);
            const step = parseInt(part.slice(slashIdx + 1), 10);
            let rangeMin = min;
            let rangeMax = max;
            if (rangeStr !== '*') {
                const dashIdx = rangeStr.indexOf('-');
                if (dashIdx !== -1) {
                    rangeMin = parseValue(rangeStr.slice(0, dashIdx), nameMap);
                    rangeMax = parseValue(rangeStr.slice(dashIdx + 1), nameMap);
                }
                else {
                    rangeMin = parseValue(rangeStr, nameMap);
                }
            }
            for (let v = rangeMin; v <= rangeMax; v += step)
                result.add(v);
            continue;
        }
        const dashIdx = part.indexOf('-');
        if (dashIdx !== -1) {
            const start = parseValue(part.slice(0, dashIdx), nameMap);
            const end = parseValue(part.slice(dashIdx + 1), nameMap);
            for (let v = start; v <= end; v++)
                result.add(v);
            continue;
        }
        result.add(parseValue(part, nameMap));
    }
    return result;
}
function parseCron(expression) {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
        throw new GhostError({
            code: 'INVALID_CRON_EXPRESSION',
            message: `Invalid cron expression "${expression}" — expected 5 space-separated fields`,
            hint: 'Format: "minute hour day month weekday"',
        });
    }
    const [minuteF, hourF, dayF, monthF, weekdayF] = parts;
    const weekdays = expandField(weekdayF, 0, 7, WEEKDAY_NAMES);
    // Cron treats 7 as Sunday (same as 0)
    if (weekdays.has(7)) {
        weekdays.add(0);
        weekdays.delete(7);
    }
    return {
        minutes: expandField(minuteF, 0, 59),
        hours: expandField(hourF, 0, 23),
        days: expandField(dayF, 1, 31),
        months: expandField(monthF, 1, 12, MONTH_NAMES),
        weekdays,
    };
}
// ---------------------------------------------------------------------------
// nextRuns
// ---------------------------------------------------------------------------
function matchesCron(date, cron) {
    return (cron.minutes.has(date.getMinutes()) &&
        cron.hours.has(date.getHours()) &&
        cron.days.has(date.getDate()) &&
        cron.months.has(date.getMonth() + 1) &&
        cron.weekdays.has(date.getDay()));
}
export function nextRuns(expression, count) {
    const cron = parseCron(expression);
    const results = [];
    // Start from the next whole minute
    const cursor = new Date();
    cursor.setSeconds(0, 0);
    cursor.setTime(cursor.getTime() + 60_000);
    // Search up to 4 years ahead to handle rare schedules like "0 0 29 2 *"
    const limit = new Date(cursor.getTime() + 4 * 366 * 24 * 60 * 60_000);
    while (results.length < count && cursor < limit) {
        if (matchesCron(cursor, cron)) {
            results.push(new Date(cursor));
        }
        cursor.setTime(cursor.getTime() + 60_000);
    }
    return results;
}
// ---------------------------------------------------------------------------
// explainCron
// ---------------------------------------------------------------------------
const MONTH_NAMES_FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_NAMES_FULL = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];
function formatHour(h) {
    if (h === 0)
        return 'midnight';
    if (h === 12)
        return 'noon';
    if (h < 12)
        return `${h} AM`;
    return `${h - 12} PM`;
}
function formatTime(minuteF, hourF) {
    const step = (f, prefix) => {
        const m = f.match(/^\*\/(\d+)$/);
        return m ? `every ${m[1]} ${prefix}` : null;
    };
    if (minuteF === '*' && hourF === '*')
        return 'every minute';
    const minuteStep = step(minuteF, 'minutes');
    const hourStep = step(hourF, 'hours');
    if (minuteStep && hourF === '*')
        return minuteStep;
    if (minuteF === '0' && hourStep)
        return hourStep;
    if (minuteF === '0' && hourF === '*')
        return 'every hour, on the hour';
    if (minuteF === '*' && hourF !== '*') {
        const h = parseInt(hourF, 10);
        return !isNaN(h) ? `every minute of ${formatHour(h)}` : `every minute of hour "${hourF}"`;
    }
    // Range hours like 9-17
    const hourRangeMatch = hourF.match(/^(\d+)-(\d+)$/);
    if (hourRangeMatch) {
        const h1 = parseInt(hourRangeMatch[1], 10);
        const h2 = parseInt(hourRangeMatch[2], 10);
        const minDesc = minuteF === '0' ? 'on the hour' : `at minute ${minuteF}`;
        return `${minDesc}, from ${formatHour(h1)} to ${formatHour(h2)}`;
    }
    // Specific hour + minute
    const h = parseInt(hourF, 10);
    const m = parseInt(minuteF, 10);
    if (!isNaN(h) && !isNaN(m)) {
        const mm = m.toString().padStart(2, '0');
        if (h === 0 && m === 0)
            return 'at midnight';
        if (h === 12 && m === 0)
            return 'at noon';
        if (h < 12)
            return `at ${h}:${mm} AM`;
        if (h === 12)
            return `at 12:${mm} PM`;
        return `at ${h - 12}:${mm} PM`;
    }
    return `at minute "${minuteF}" of hour "${hourF}"`;
}
function formatDayPart(dayF, monthF, weekdayF) {
    if (dayF === '*' && monthF === '*' && weekdayF === '*')
        return null;
    const segments = [];
    if (weekdayF !== '*') {
        if (weekdayF === '1-5') {
            segments.push('Monday through Friday');
        }
        else if (weekdayF === '0' || weekdayF === '7') {
            segments.push('on Sundays');
        }
        else if (weekdayF === '6') {
            segments.push('on Saturdays');
        }
        else {
            const rangeMatch = weekdayF.match(/^(\d+)-(\d+)$/);
            if (rangeMatch) {
                const d1 = parseInt(rangeMatch[1], 10) % 7;
                const d2 = parseInt(rangeMatch[2], 10) % 7;
                segments.push(`${WEEKDAY_NAMES_FULL[d1]} through ${WEEKDAY_NAMES_FULL[d2]}`);
            }
            else {
                const d = parseInt(weekdayF, 10);
                if (!isNaN(d)) {
                    segments.push(`on ${WEEKDAY_NAMES_FULL[d % 7]}s`);
                }
                else {
                    const named = WEEKDAY_NAMES[weekdayF.toLowerCase()];
                    if (named !== undefined) {
                        segments.push(`on ${WEEKDAY_NAMES_FULL[named]}s`);
                    }
                    else {
                        segments.push(`on weekday "${weekdayF}"`);
                    }
                }
            }
        }
    }
    if (dayF !== '*') {
        const stepMatch = dayF.match(/^\*\/(\d+)$/);
        if (stepMatch) {
            segments.push(`every ${stepMatch[1]} days`);
        }
        else {
            const d = parseInt(dayF, 10);
            segments.push(!isNaN(d) ? `on day ${d}` : `on day "${dayF}"`);
        }
    }
    if (monthF !== '*') {
        const stepMatch = monthF.match(/^\*\/(\d+)$/);
        if (stepMatch) {
            segments.push(`every ${stepMatch[1]} months`);
        }
        else {
            const mo = parseInt(monthF, 10);
            if (!isNaN(mo) && mo >= 1 && mo <= 12) {
                segments.push(`in ${MONTH_NAMES_FULL[mo - 1]}`);
            }
            else {
                const named = MONTH_NAMES[monthF.toLowerCase()];
                if (named !== undefined) {
                    segments.push(`in ${MONTH_NAMES_FULL[named - 1]}`);
                }
                else {
                    segments.push(`in month "${monthF}"`);
                }
            }
        }
    }
    return segments.join(', ');
}
export function explainCron(expression) {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
        throw new GhostError({
            code: 'INVALID_CRON_EXPRESSION',
            message: `Invalid cron expression "${expression}" — expected 5 space-separated fields`,
            hint: 'Format: "minute hour day month weekday"',
        });
    }
    const [minuteF, hourF, dayF, monthF, weekdayF] = parts;
    if (minuteF === '*' && hourF === '*' && dayF === '*' && monthF === '*' && weekdayF === '*') {
        return 'Every minute';
    }
    const timePart = formatTime(minuteF, hourF);
    const dayPart = formatDayPart(dayF, monthF, weekdayF);
    return dayPart ? `${timePart}, ${dayPart}` : timePart;
}
