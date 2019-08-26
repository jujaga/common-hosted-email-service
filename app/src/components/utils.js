const utils = {
  /** Returns a new object where undefined and empty arrays are dropped
   *  @param {object} obj A JSON Object
   *  @returns {object} A JSON Object without empty arrays and undefined properties
   */
  filterUndefinedAndEmpty: obj => {
    const ret = {};
    Object.keys(obj)
      .filter((key) => obj[key] !== undefined && obj[key].length)
      .forEach((key) => ret[key] = obj[key]);
    return ret;
  },

  /** Returns a pretty JSON representation of an object
   *  @param {object} obj A JSON Object
   *  @param {integer} indent Number of spaces to indent
   *  @returns {string} A pretty printed string representation of `obj` with `indent` indentation
   */
  prettyStringify: (obj, indent = 2) => JSON.stringify(obj, null, indent),

  /** Returns a string in Pascal Case
   * @param {string} str A string
   * @returns {string} A string formatted in Pascal Case
   */
  toPascalCase: str => str.toLowerCase().replace(/\b\w/g, t => t.toUpperCase())
};

module.exports = utils;
