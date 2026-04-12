function getSchoolCode() {
  const year = new Date().getFullYear();
  return `royalchan${year}`;
}

module.exports = { getSchoolCode };
