const puppeteer = require('puppeteer')
const debug = require('debug')('web-scraper-headless:chrome-headless-browser')
const {ExecutionContext} = require('puppeteer/lib/ExecutionContext')
const contentSraperBundler = require('../content_script/contentScraperHeadlessBundler')
const jqueryDeferred = require('jquery-deferred')
const whenCallSequentially = require('../assets/jquery.whencallsequentially')

class ChromeHeadlessBrowser {
  constructor (options) {
    this.pageLoadDelay = options.pageLoadDelay
    const cacheEnabled = options.cacheEnabled || false
    const deviceWidth = options.deviceWidth || 1600
    const deviceHeight = options.deviceHeight || 900
    const userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36'

    // constructors cannot handle asynchronous
    this.browserPromise = puppeteer.launch({
      headless: true
    })
    this.pagePromise = this.browserPromise.then(async function (browser) {
      const page = await browser.newPage();
  
      await page.setCacheEnabled(cacheEnabled);
      await page.setViewport({width: deviceWidth, height: deviceHeight})
      await page.setUserAgent(userAgent);

      return page
    })
  }
  async loadUrl (url) {
    debug('Loading url', url)
    const page = await this.pagePromise
    await page.goto(url, {waitUntil: 'networkidle2'})
  }
  async close () {
    try {
      const browser = await this.browserPromise
      await browser.close()
    } catch (e) {
      console.error(e)
    }
  }
  saveImages (record, namingFunction) {
    var deferredResponse = jqueryDeferred.Deferred()
    var deferredImageStoreCalls = []
    var prefixLength = '_imageBase64-'.length
    for (var attr in record) {
      if (attr.substr(0, prefixLength) === '_imageBase64-') {
        throw new Error('Downloading images is not yet supported')
      }
    }
    whenCallSequentially(deferredImageStoreCalls).done(function () {
      deferredResponse.resolve()
    })

    return deferredResponse.promise()
  }
  async fetchData (url, sitemap, parentSelectorId, callback, scope) {
    try {
      const page = await this.pagePromise
      await this.loadUrl(url)

      const mainFrame = page.mainFrame()

      // Maybe we don't need a context each time?
      const isolatedWorldInfo = await page._client.send('Page.createIsolatedWorld', {frameId: mainFrame._id, worldName: 'web-scraper-headless'})
      const executionContextId = isolatedWorldInfo.executionContextId
      const JsHandleFactory = page._frameManager.createJSHandle.bind(page._frameManager, executionContextId)

      const executionContext = new ExecutionContext(page._client, {id: executionContextId}, JsHandleFactory)

      const bundle = await contentSraperBundler.getBundle()
      await executionContext.evaluate(bundle)
      const message = {
        extractData: true,
        sitemap: JSON.parse(JSON.stringify(sitemap)),
        parentSelectorId: parentSelectorId
      }

      const data = await executionContext.evaluate(function (message) {
        return new Promise(function (resolve, reject) {
          window.webScraper(message, null, function (data) {
            resolve(data)
          })
        })
      }, message)
      callback.call(scope, null, data)
    } catch (e) {
      return callback(e)
    }
  }
}

module.exports = ChromeHeadlessBrowser
