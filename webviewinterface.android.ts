import { WebViewInterfaceCommon } from './webviewinterface-common';
import { WebView } from 'tns-core-modules/ui/web-view/web-view';
import * as platform from 'tns-core-modules/platform';

export class WebViewInterface extends WebViewInterfaceCommon {
  constructor(webview: WebView, src?: string) {
    super(webview, src || '');

    this._initWebView(src || '');
  }

  /**
   * Initializes webView for communication between android and webView.
   */
  private _initWebView(src: string) {
    if (this.webView.isLoaded) {
      this._setAndroidWebViewSettings(src);
    } else {
      const handlerRef = this.webView.on(WebView.loadedEvent, () => {
        this._setAndroidWebViewSettings(src);
        this.webView.off(WebView.loadedEvent, handlerRef);
      });
    }
  }

  private _setAndroidWebViewSettings(src: string) {
    const oJSInterface = getAndroidJSInterface(this);
    const androidSettings = this.webView.android.getSettings();
    androidSettings.setJavaScriptEnabled(true);
    this.webView.android.addJavascriptInterface(
      oJSInterface,
      'androidWebViewInterface',
    );

    // If src is provided, then setting it.
    // To make javascriptInterface available in web-view, it should be set before
    // web-view's loadUrl method is called. So setting src after javascriptInterface is set.
    if (src) {
      this.webView.src = src;
    }
  }

  /**
   * Executes event/command/jsFunction in webView.
   */
  protected _executeJS(strJSFunction: string) {
    return new Promise((resolve, reject) => {
      this.webView.android.evaluateJavascript(
        strJSFunction,
        (data: any, error: any) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(data);
        },
      );
    });
  }
}

declare const com: any;
declare const java: any;

/**
 * Factory function to provide instance of Android JavascriptInterface.
 */
function getAndroidJSInterface(oWebViewInterface: WebViewInterface) {
  const AndroidWebViewInterface = com.shripalsoni.natiescriptwebviewinterface.WebViewInterface.extend(
    {
      /**
       * On call from webView to android, this function is called from handleEventFromWebView method of WebViewInerface class
       */
      onWebViewEvent(webViewId: number, eventName: string, jsonData: any) {
        // getting webviewInterface object by webViewId from static map.
        const oWebViewInterface = getWebViewIntefaceObjByWebViewId(webViewId);
        if (oWebViewInterface) {
          oWebViewInterface._onWebViewEvent(eventName, jsonData);
        }
      },
    },
  );

  // creating androidWebViewInterface with unique web-view id.
  return new AndroidWebViewInterface(
    new java.lang.String('' + oWebViewInterface.id),
  );
}

/**
 * Returns webViewInterface object mapped with the passed webViewId.
 */
function getWebViewIntefaceObjByWebViewId(webViewId: number) {
  return WebViewInterfaceCommon.webViewInterfaceIdMap.get(webViewId);
}
