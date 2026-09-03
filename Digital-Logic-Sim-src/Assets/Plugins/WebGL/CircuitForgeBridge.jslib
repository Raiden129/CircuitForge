mergeInto(LibraryManager.library, {
  CircuitForgeResolve: function (requestIdPtr, responseJsonPtr) {
    var requestId = UTF8ToString(requestIdPtr);
    var responseJson = UTF8ToString(responseJsonPtr);
    if (window.CircuitForgeBridge && window.CircuitForgeBridge.resolve) {
      window.CircuitForgeBridge.resolve(requestId, responseJson);
    } else {
      console.warn("[CircuitForgeBridge.jslib] window.CircuitForgeBridge.resolve not found for requestId:", requestId);
    }
  }
});
