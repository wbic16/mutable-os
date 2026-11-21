// Shared native Entity enrichment validation for browser and canonical services.
const text = (v, max = 1e3) => typeof v === "string" && !!v.trim() && v.length <= max;
function publicImageUrl(value) {
  if (!text(value, 2048))
    return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
function entityDate(input) {
  const keys = ["type", "expression", "startYear", "startMonth", "startDay", "startHour", "startMinute", "startSecond", "endYear", "endMonth", "endDay", "endHour", "endMinute", "endSecond", "precision", "approximation", "certainty", "extentKind", "qualifier", "normalizationProfile", "lowerBoundDay", "upperBoundDayExclusive", "attributes"];
  if (!input || typeof input !== "object" || Object.keys(input).some((k) => !keys.includes(k)) || !text(input.type, 80))
    throw Error("Invalid Entity date");
  for (const side of ["start", "end"]) {
    const year = input[side + "Year"], month = input[side + "Month"], day = input[side + "Day"];
    if (year != null && (!Number.isSafeInteger(year) || Math.abs(year) > 1e9))
      throw Error("Invalid date year");
    if (month != null && (!Number.isInteger(month) || month < 1 || month > 12 || year == null))
      throw Error("Invalid date month");
    if (day != null) {
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0), max = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
      if (month == null || !Number.isInteger(day) || day < 1 || day > max)
        throw Error("Invalid date day");
    }
    for (const [part, max] of [["Hour", 23], ["Minute", 59], ["Second", 60]]) {
      const value = input[side + part];
      if (value != null && (!Number.isInteger(value) || value < 0 || value > max))
        throw Error("Invalid date time");
    }
  }
  for (const key of ["expression", "precision", "approximation", "certainty", "extentKind", "qualifier", "normalizationProfile"])
    if (input[key] != null && !text(input[key], 512))
      throw Error("Invalid date qualifier");
  for (const key of ["lowerBoundDay", "upperBoundDayExclusive"])
    if (input[key] != null && !Number.isSafeInteger(input[key]))
      throw Error("Invalid date bound");
  if (input.lowerBoundDay != null && input.upperBoundDayExclusive != null && input.lowerBoundDay >= input.upperBoundDayExclusive)
    throw Error("Invalid date bounds");
  if (input.startYear != null && input.endYear != null) {
    const a = [input.startYear, input.startMonth ?? 1, input.startDay ?? 1], b = [input.endYear, input.endMonth ?? 12, input.endDay ?? 31];
    const first = a.findIndex((v, i) => v !== b[i]);
    if (first >= 0 && a[first] > b[first])
      throw Error("Invalid temporal range");
  }
  if (input.startYear == null && !input.expression)
    throw Error("Date requires a value or expression");
  if (JSON.stringify(input).length > 4096)
    throw Error("Date metadata budget exceeded");
  return structuredClone(input);
}
function entityEnrichment(input) {
  if (!input || typeof input !== "object" || Object.keys(input).some((k) => !["version", "subtypes", "dates", "externalIds", "thumbnail"].includes(k)) || input.version !== void 0 && input.version !== 1)
    throw Error("Invalid enrichment");
  const { subtypes = [], dates = [], externalIds = [], thumbnail } = input;
  if (!Array.isArray(subtypes) || subtypes.length > 16 || subtypes.some((v) => !text(v, 128)) || !Array.isArray(dates) || dates.length > 16 || !Array.isArray(externalIds) || externalIds.length > 16)
    throw Error("Enrichment budget exceeded");
  for (const id of externalIds) {
    if (!id || Object.keys(id).some((k) => !["namespace", "value"].includes(k)) || !text(id.namespace, 64) || !text(id.value, 256) || id.namespace === "wikidata" && !/^Q[1-9]\d{0,14}$/.test(id.value))
      throw Error("Invalid authority candidate");
  }
  if (thumbnail && (Object.keys(thumbnail).some((k) => !["url", "source", "attribution", "license"].includes(k)) || !publicImageUrl(thumbnail.url) || ["source", "attribution", "license"].some((k) => thumbnail[k] != null && !text(thumbnail[k], 2048))))
    throw Error("Invalid representative image");
  return { version: 1, subtypes: [...new Set(subtypes)], dates: dates.map(entityDate), externalIds: structuredClone(externalIds), ...thumbnail ? { thumbnail: structuredClone(thumbnail) } : {} };
}
export {
  entityDate,
  entityEnrichment,
  publicImageUrl
};
