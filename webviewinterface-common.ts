import { WebView } from 'tns-core-modules/ui/web-view';
import { EventCallback, SuccessCallback, FailCallback } from '.';

/**
 * Parses json string to object if valid.
 */
export function parseJSON(data: string) {
  try {
    return JSON.parse(data);
  } catch (e) {
    return false;
  }
}

let cntWebViewId = 0;
let cntJSCallReqId = 0;

export abstract class WebViewInterfaceCommon {
  public static webViewInterfaceIdMap = new Map<
    number,
    WebViewInterfaceCommon
  >();
  /**
   * Mapping of webView event/command and its native handler
   */
  protected readonly eventListenerMap = new Map<string, EventCallback[]>();

  /**
   * Mapping of js call request id and its success handler.
   * Based on this mapping, the registered success handler will be called
   * on successful response from the js call
   */
  protected readonly jsCallReqIdSuccessCallbackMap = new Map<
    string,
    SuccessCallback
  >();
  /**
   * Mapping of js call request id and its error handler.
   * Based on this mapping, the error handler will be called
   * on error from the js call
   */
  protected readonly jsCallReqIdErrorCallbackMap = new Map<
    string,
    FailCallback
  >();

  /**
   * Web-view instance unique id to handle scenarios of multiple webview on single page.
   */
  public readonly id: number;

  constructor(public webView: WebView, src: string) {
    this.id = ++cntWebViewId;
    WebViewInterfaceCommon.webViewInterfaceIdMap.set(this.id, this);
  }

  /**
   * Prepares call to a function in webView, which handles native event/command calls
   */
  protected _prepareEmitEventJSCall(eventName: string, data: any) {
    data = JSON.stringify(data); // calling stringify for all types of data. Because if data is a string containing ", we need to escape that. Ref: https://github.com/shripalsoni04/nativescript-webview-interface/pull/6
    return `window.nsWebViewInterface._onNativeEvent(${JSON.stringify(eventName)}, ${JSON.stringify(data)});`;
  }
  /**
   * Prepares call to a function in webView, which calls the specified function in the webView
   */
  protected _prepareJSFunctionCall(
    functionName: string,
    arrArgs: any[],
    successHandler: SuccessCallback,
    errorHandler: FailCallback,
  ) {
    arrArgs = arrArgs || [];

    if (!Array.isArray(arrArgs)) {
      arrArgs = [arrArgs];
    }

    // creating id with combination of web-view id and req id
    const reqId = `${this.id}#${++cntJSCallReqId}`;
    this.jsCallReqIdSuccessCallbackMap.set(reqId, successHandler);
    this.jsCallReqIdErrorCallbackMap.set(reqId, errorHandler);
    return `window.nsWebViewInterface._callJSFunction(${JSON.stringify(reqId)}, ${JSON.stringify(functionName)}, ${JSON.stringify(arrArgs)});`;
  }

  /**
   * Handles response/event/command from webView.
   */
  public _onWebViewEvent(eventName: string, data: any) {
    const oData = parseJSON(data) || data;

    // in case of JS call result, eventName will be _jsCallResponse
    if (eventName === '_jsCallResponse') {
      let reqId = '"' + oData.reqId + '"';
      let callback: any;

      if (oData.isError) {
        callback = this.jsCallReqIdErrorCallbackMap.get(reqId);
      } else {
        callback = this.jsCallReqIdSuccessCallbackMap.get(reqId);
      }

      this.jsCallReqIdErrorCallbackMap.delete(reqId);
      this.jsCallReqIdSuccessCallbackMap.delete(reqId);

      if (callback) {
        callback(oData.response);
      }
      return;
    }

    for (const event of this.eventListenerMap.get(eventName) || []) {
      if (event(oData) === false) {
        break;
      }
    }
  }

  /**
   * Registers handler for event/command emitted from webview
   * @param   {string}    eventName - Any event name except reserved '_jsCallResponse'
   * @param   {function}  callback - Callback function to be executed on event/command receive.
   */
  public on(eventName: string, callback: EventCallback) {
    if (eventName === '_jsCallResponse') {
      throw new Error(
        '_jsCallResponse eventName is reserved for internal use. You cannot attach listeners to it.',
      );
    }

    const events = this.eventListenerMap.get(eventName) || [];
    events.push(callback);
    this.eventListenerMap.set(eventName, events);
  }

  /**
   * Deregisters handler for event/command emitted from webview
   * @param   {string}    eventName - Any event name except reserved '_jsCallResponse'
   * @param   {function}  callback - Callback function to be executed on event/command receive.
   **/
  public off(eventName: string, callback?: EventCallback) {
    if (eventName === '_jsCallResponse') {
      throw new Error(
        '_jsCallResponse eventName is reserved for internal use. You cannot deattach listeners to it.',
      );
    }

    if (!callback) {
      this.eventListenerMap.delete(eventName);
      return;
    }

    if (!this.eventListenerMap.has(eventName)) {
      return;
    }

    const events = [];
    for (const oldCallback of this.eventListenerMap.get(eventName) || []) {
      if (oldCallback !== callback) {
        events.push(oldCallback);
      }
    }

    if (events.length === 0) {
      this.eventListenerMap.delete(eventName);
      return;
    }

    this.eventListenerMap.set(eventName, events);
  }
  /**
   * Executes event/command/jsFunction in webView.
   */
  protected abstract _executeJS(strJSFunction: string): Promise<any>;

  /**
   * Emits event/command with payload to webView.
   * @param   {string}    eventName - Any event name
   * @param   {any}       data - Payload to send wiht event/command
   */
  public emit(eventName: string, data: any) {
    var strJSFunction = this._prepareEmitEventJSCall(eventName, data);
    this._executeJS(strJSFunction);
  }

  /**
   * Calls function in webView
   * @param   {string}    functionName - Function should be in global scope in webView
   * @param   {any[]}     args - Arguments of the function
   * @param   {function}  callback - Function to call on result from webView
   */
  public callJSFunction(
    functionName: string,
    args: any[],
    successHandler: SuccessCallback,
    errorHandler: FailCallback,
  ) {
    const strJSFunction = this._prepareJSFunctionCall(
      functionName,
      args,
      successHandler,
      errorHandler,
    );
    this._executeJS(strJSFunction);
  }

  /**
   * Clears mappings of callbacks and webview.
   * This needs to be called in navigatedFrom event handler in page where webviewInterface plugin is used.
   */
  public destroy() {
    /**
     *
     * Resetting src to blank. This needs to be done to avoid issue of communication stops working from webView to nativescript when
     * page with webVeiw is opened on back button press on android.
     * This issue occurs because nativescript destroys the native webView element on navigation if cache is disabled, and when we navigate back
     * it recreates the native webView and attaches it to nativescript webView element. So we have to reinitiate this plugin with new webView instance.
     * Now, to make communication from webVeiw to nativescript work on android,
     * androidJSInterface should be loaded before any request loads on webView. So if we don't reset src on nativescript webView, that src will start
     * loading as soon as the native webView is created and before we add androidJSInterface. This results in stoppage of communication from webView
     * to nativescript when page is opened on back navigation.
     */
    if (this.webView) {
      this.webView.src = '';
    }

    this.eventListenerMap.clear();
    this.jsCallReqIdSuccessCallbackMap.clear();
    this.jsCallReqIdErrorCallbackMap.clear();
    WebViewInterfaceCommon.webViewInterfaceIdMap.delete(this.id);
  }
}
