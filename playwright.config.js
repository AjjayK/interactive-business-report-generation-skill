const path = require("path");

module.exports = {
  testDir: path.join(__dirname, "tests", "ui"),
  outputDir: path.join(__dirname, "tests", ".artifacts", "playwright"),
  reporter: "line",
  timeout: 30000,
  expect: {
    timeout: 5000,
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.01
    }
  },
  use: {
    browserName: "chromium",
    headless: true
  }
};