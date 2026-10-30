// The functions a formula's editor lists, and the editing helpers it uses.
// The server defines and runs the functions (business/Formula, 94 of them);
// formula.test.ts keeps this list the same as its own. The editor's alone
// (FormulaEditor, a chunk of its own): no table's first screen carries it.

export interface FormulaFunction {
  name: string
  syntax: string
  about: string
}

export const FORMULA_FUNCTIONS: { group: string; items: FormulaFunction[] }[] = [
  {
    group: "Logic",
    items: [
      { name: "IF", syntax: "IF(test, then, otherwise)", about: "One value or another, by a test" },
      { name: "SWITCH", syntax: "SWITCH(value, match, result, …, otherwise)", about: "The result for the first match" },
      { name: "AND", syntax: "AND(a, b, …)", about: "Whether all of them are true" },
      { name: "OR", syntax: "OR(a, b, …)", about: "Whether any of them is true" },
      { name: "NOT", syntax: "NOT(test)", about: "The opposite" },
      { name: "ISBLANK", syntax: "ISBLANK(value)", about: "Whether it's empty" },
      { name: "ISERROR", syntax: "ISERROR(value)", about: "Whether it can't be worked out" },
      { name: "BLANK", syntax: "BLANK()", about: "Nothing" },
      { name: "TRUE", syntax: "TRUE()", about: "Yes, as a value; TRUE on its own works too" },
      { name: "FALSE", syntax: "FALSE()", about: "No, as a value; FALSE on its own works too" },
      { name: "IFS", syntax: "IFS(test, value, test, value, …, otherwise)", about: "The value after the first test that holds; IF without the nesting" },
      { name: "XOR", syntax: "XOR(a, b, …)", about: "Whether an odd number of them are true" },
      { name: "ERROR", syntax: "ERROR(why)", about: "Marks the row as wrong, saying why; ISERROR finds it" },
    ],
  },
  {
    group: "Numbers",
    items: [
      { name: "SUM", syntax: "SUM(a, b, …)", about: "Added up" },
      { name: "AVERAGE", syntax: "AVERAGE(a, b, …)", about: "The average, leaving out blanks" },
      { name: "MIN", syntax: "MIN(a, b, …)", about: "The smallest" },
      { name: "MAX", syntax: "MAX(a, b, …)", about: "The largest" },
      { name: "ROUND", syntax: "ROUND(number, places)", about: "Rounded to a number of decimal places" },
      { name: "ROUNDUP", syntax: "ROUNDUP(number, places)", about: "Rounded away from zero" },
      { name: "ROUNDDOWN", syntax: "ROUNDDOWN(number, places)", about: "Rounded toward zero" },
      { name: "CEILING", syntax: "CEILING(number, step)", about: "Up to a multiple of step" },
      { name: "FLOOR", syntax: "FLOOR(number, step)", about: "Down to a multiple of step" },
      { name: "ABS", syntax: "ABS(number)", about: "Without its sign" },
      { name: "SQRT", syntax: "SQRT(number)", about: "The square root" },
      { name: "MOD", syntax: "MOD(number, by)", about: "What's left after dividing" },
      { name: "POWER", syntax: "POWER(number, power)", about: "Raised to a power" },
      { name: "VALUE", syntax: "VALUE(text)", about: "Text such as \"$1,200\" as a number" },
      { name: "INT", syntax: "INT(number)", about: "Down to a whole number" },
      { name: "EVEN", syntax: "EVEN(number)", about: "Away from zero to an even number" },
      { name: "ODD", syntax: "ODD(number)", about: "Away from zero to an odd number" },
      { name: "SIGN", syntax: "SIGN(number)", about: "1 above zero, -1 below it, 0 at it" },
      { name: "LOG", syntax: "LOG(number, base)", about: "The logarithm, in base 10 unless you give one" },
      { name: "LN", syntax: "LN(number)", about: "The natural logarithm" },
      { name: "EXP", syntax: "EXP(power)", about: "e raised to a power" },
      { name: "PI", syntax: "PI()", about: "π, 3.14159…" },
      { name: "COUNT", syntax: "COUNT(a, b, …)", about: "How many are numbers, a list's items included" },
      { name: "COUNTA", syntax: "COUNTA(a, b, …)", about: "How many aren't empty, a list's items included" },
      { name: "COUNTALL", syntax: "COUNTALL(a, b, …)", about: "How many there are, empty ones included" },
    ],
  },
  {
    group: "Text",
    items: [
      { name: "CONCATENATE", syntax: "CONCATENATE(a, b, …)", about: "Joined into one text; & does the same" },
      { name: "LEN", syntax: "LEN(text)", about: "How many characters" },
      { name: "UPPER", syntax: "UPPER(text)", about: "In capitals" },
      { name: "LOWER", syntax: "LOWER(text)", about: "In small letters" },
      { name: "TRIM", syntax: "TRIM(text)", about: "Without spaces at either end" },
      { name: "LEFT", syntax: "LEFT(text, count)", about: "The first characters" },
      { name: "RIGHT", syntax: "RIGHT(text, count)", about: "The last characters" },
      { name: "MID", syntax: "MID(text, start, count)", about: "Characters from the middle, counting from 1" },
      { name: "FIND", syntax: "FIND(what, text)", about: "Where it first appears, or 0" },
      { name: "SUBSTITUTE", syntax: "SUBSTITUTE(text, old, new)", about: "With one text swapped for another" },
      { name: "REPT", syntax: "REPT(text, times)", about: "Repeated" },
      { name: "SEARCH", syntax: "SEARCH(what, text)", about: "Where it first appears, or empty" },
      { name: "CONTAINS", syntax: "CONTAINS(text, what)", about: "Whether it appears, in any case; for a list, whether it's an item" },
      { name: "REPLACE", syntax: "REPLACE(text, start, count, with)", about: "With characters from start swapped for other text" },
      { name: "T", syntax: "T(value)", about: "The value when it's text, otherwise empty" },
      { name: "ENCODE_URL_COMPONENT", syntax: "ENCODE_URL_COMPONENT(text)", about: "Made safe to put in a link" },
      { name: "REGEX_MATCH", syntax: "REGEX_MATCH(text, \"pattern\")", about: "Whether a regular expression matches" },
      { name: "REGEX_EXTRACT", syntax: "REGEX_EXTRACT(text, \"pattern\")", about: "The first match, or its first group" },
      { name: "REGEX_REPLACE", syntax: "REGEX_REPLACE(text, \"pattern\", with)", about: "Every match swapped; $1 is a group" },
    ],
  },
  {
    group: "Dates",
    items: [
      { name: "TODAY", syntax: "TODAY()", about: "Today, where you are" },
      { name: "NOW", syntax: "NOW()", about: "This moment" },
      { name: "DATEADD", syntax: "DATEADD(date, count, \"days\")", about: "A date moved by days, weeks, months or years" },
      { name: "DATETIME_DIFF", syntax: "DATETIME_DIFF(later, earlier, \"days\")", about: "The time between two dates" },
      { name: "WORKDAY_DIFF", syntax: "WORKDAY_DIFF(start, end, holidays)", about: "Weekdays from start to end, both counted, less holidays" },
      { name: "WORKDAY", syntax: "WORKDAY(start, days, holidays)", about: "The weekday that many weekdays on, skipping holidays" },
      { name: "YEAR", syntax: "YEAR(date)", about: "The year" },
      { name: "MONTH", syntax: "MONTH(date)", about: "The month, 1 to 12" },
      { name: "DAY", syntax: "DAY(date)", about: "The day of the month" },
      { name: "WEEKDAY", syntax: "WEEKDAY(date)", about: "The day of the week, 0 for Sunday" },
      { name: "WEEKNUM", syntax: "WEEKNUM(date, \"Monday\")", about: "The week of the year; weeks start on Sunday unless you say" },
      { name: "HOUR", syntax: "HOUR(date)", about: "The hour, 0 to 23" },
      { name: "MINUTE", syntax: "MINUTE(date)", about: "The minute" },
      { name: "SECOND", syntax: "SECOND(date)", about: "The second" },
      { name: "DATETIME_FORMAT", syntax: "DATETIME_FORMAT(date, \"D MMMM YYYY\")", about: "Written your way: YYYY, MMMM, Do, HH:mm…" },
      { name: "DATETIME_PARSE", syntax: "DATETIME_PARSE(text, \"DD/MM/YYYY\")", about: "Text read as a date, in a format if you give one" },
      { name: "DATESTR", syntax: "DATESTR(date)", about: "The day as 2026-10-12" },
      { name: "TIMESTR", syntax: "TIMESTR(date)", about: "The time as 14:30:00" },
      { name: "SET_TIMEZONE", syntax: "SET_TIMEZONE(date, \"Asia/Kolkata\")", about: "Read on another zone's clock" },
      { name: "SET_LOCALE", syntax: "SET_LOCALE(date, \"fr\")", about: "Month and day names in another language" },
      { name: "IS_SAME", syntax: "IS_SAME(date, date, \"week\")", about: "Whether two dates fall in the same day, week, month…" },
      { name: "IS_BEFORE", syntax: "IS_BEFORE(date, date)", about: "Whether the first comes before the second" },
      { name: "IS_AFTER", syntax: "IS_AFTER(date, date)", about: "Whether the first comes after the second" },
      { name: "TONOW", syntax: "TONOW(date)", about: "Whole days between the date and today" },
      { name: "FROMNOW", syntax: "FROMNOW(date)", about: "Whole days between today and the date" },
    ],
  },
  {
    group: "Lists",
    items: [
      { name: "ARRAYJOIN", syntax: "ARRAYJOIN(list, \"; \")", about: "A list's items joined, with a comma unless you give another" },
      { name: "ARRAYUNIQUE", syntax: "ARRAYUNIQUE(list)", about: "Each item once" },
      { name: "ARRAYCOMPACT", syntax: "ARRAYCOMPACT(list)", about: "Without its empty items" },
      { name: "ARRAYFLATTEN", syntax: "ARRAYFLATTEN(list, …)", about: "Lists put together as one" },
      { name: "ARRAYSLICE", syntax: "ARRAYSLICE(list, start, end)", about: "Items from start to end, counting from 1; -1 is the last" },
      { name: "FILTER", syntax: "FILTER(list, CURRENT() > 100)", about: "The items a test holds for; CURRENT() is each one" },
      { name: "MAP", syntax: "MAP(list, UPPER(CURRENT()))", about: "A value worked out for each item" },
      { name: "CURRENT", syntax: "CURRENT()", about: "The item FILTER or MAP is looking at" },
    ],
  },
  {
    group: "This row",
    items: [
      { name: "RECORD_ID", syntax: "RECORD_ID()", about: "The row's id" },
      { name: "CREATED_TIME", syntax: "CREATED_TIME()", about: "When the row was made" },
      { name: "LAST_MODIFIED_TIME", syntax: "LAST_MODIFIED_TIME()", about: "When the row last changed" },
    ],
  },
]

/** A field's name as a formula writes it: in braces, with } and \ escaped. */
export function fieldRef(name: string): string {
  return `{${name.replace(/[\\}]/g, (c) => `\\${c}`)}}`
}

/** text with insert put in place of the selection from start to end, and where the caret goes. */
export function insertAt(text: string, start: number, end: number, insert: string): { text: string; caret: number } {
  return { text: text.slice(0, start) + insert + text.slice(end), caret: start + insert.length }
}
