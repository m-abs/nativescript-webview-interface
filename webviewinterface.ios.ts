import { WebViewInterfaceCommon, parseJSON } from './webviewinterface-common';
import { WebView } from 'tns-core-modules/ui/web-view/web-view';
import * as platform from 'tns-core-modules/platform';

export class WebViewInterface extends WebViewInterfaceCommon {
  /**
   * Since NativeScript v3.4.0 the UI component WebView is using WKWebView which broke this plugin.
   * This property is used to overcome this issue and maintain compatibility with older versions of NativeScript.
   *
   * @see https://github.com/shripalsoni04/nativescript-webview-interface/issues/22
   *
   */
  public isUsingWKWebView = this.webView.ios.constructor.name === 'WKWebView';

  /**
   * Intercepts all requests from webView and processes requests with js2ios: protocol.
   * Communication from webView to iOS is done by custom urls.
   * e.g js2ios:{"eventName": "anyEvent", "resId": number}. Here resId is used as unique message id
   * to fetch result from webView as we cannot rely on url for large results.
   *
   */
  private _interceptCallsFromWebview = (args: any) => {
    const request = args.url;
    const reqMsgProtocol = 'js2ios:';
    const reqMsgStartIndex = request.indexOf(reqMsgProtocol);
    if (reqMsgStartIndex !== 0) {
      return;
    }

    const reqMsg = decodeURIComponent(
      request.substring(reqMsgProtocol.length, request.length),
    );

    const oReqMsg = parseJSON(reqMsg);
    if (!oReqMsg) {
      return;
    }

    const eventName = oReqMsg.eventName;
    this._executeJS(
      'window.nsWebViewInterface._getIOSResponse(' + oReqMsg.resId + ')',
    )
      .then(data => {
        this._onWebViewEvent(eventName, data);
      })
      .catch(function (error) {
        throw error;
      });
  };

  constructor(webview: WebView, src: string) {
    super(webview, src);

    this._listenWebViewLoadStarted();
    if (src) {
      this.webView.src = src;
    }
  }

  /**
   * Attaches loadStarted event listener on webView to intercept calls and process them.
   */
  private _listenWebViewLoadStarted() {
    this.webView.on(
      WebView.loadStartedEvent,
      this._interceptCallsFromWebview,
      this,
    );
  }

  /**
   * Executes event/command/jsFunction in webView.
   */
  public _executeJS(strJSFunction: string) {
    return new Promise((resolve, reject) => {
      if (this.isUsingWKWebView) {
        this.webView.ios.evaluateJavaScriptCompletionHandler(
          strJSFunction,
          (data: any, error: any) => {
            if (error) {
              reject(error);
            } else {
              resolve(data);
            }
          },
        );
      } else {
        resolve(
          this.webView.ios.stringByEvaluatingJavaScriptFromString(
            strJSFunction,
          ),
        );
      }
    });
  }

  /**
   * Removes loadStarted event listener.
   */
  public destroy() {
    this.webView.off(
      WebView.loadStartedEvent,
      this._interceptCallsFromWebview,
      this,
    );
    super.destroy();
  }
}
