import UIKit
import WebKit
import Photos

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        let win = UIWindow(frame: UIScreen.main.bounds)
        win.rootViewController = FrameKitViewController()
        win.makeKeyAndVisible()
        self.window = win
        return true
    }
}

final class LocalWebSchemeHandler: NSObject, WKURLSchemeHandler {
    private let wwwRoot: URL

    init(wwwRoot: URL) {
        self.wwwRoot = wwwRoot
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let reqUrl = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(NSError(domain: "FrameKit", code: 400))
            return
        }
        var rel = reqUrl.path
        if rel.isEmpty || rel == "/" { rel = "/index.html" }
        while rel.hasPrefix("/") { rel.removeFirst() }
        if rel.contains("..") {
            urlSchemeTask.didFailWithError(NSError(domain: "FrameKit", code: 403))
            return
        }

        let fileUrl = wwwRoot.appendingPathComponent(rel)
        guard let data = try? Data(contentsOf: fileUrl) else {
            let resp = HTTPURLResponse(url: reqUrl, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!
            urlSchemeTask.didReceive(resp)
            urlSchemeTask.didFinish()
            return
        }

        let mime = guessMime(rel)
        let headers: [String: String] = [
            "Content-Type": mime,
            "Content-Length": "\(data.count)",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache"
        ]
        let resp = HTTPURLResponse(url: reqUrl, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        urlSchemeTask.didReceive(resp)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func guessMime(_ path: String) -> String {
        let p = path.lowercased()
        if p.hasSuffix(".html") { return "text/html; charset=utf-8" }
        if p.hasSuffix(".js") || p.hasSuffix(".mjs") { return "application/javascript; charset=utf-8" }
        if p.hasSuffix(".wasm") { return "application/wasm" }
        if p.hasSuffix(".css") { return "text/css; charset=utf-8" }
        if p.hasSuffix(".png") { return "image/png" }
        if p.hasSuffix(".jpg") || p.hasSuffix(".jpeg") { return "image/jpeg" }
        if p.hasSuffix(".svg") { return "image/svg+xml" }
        if p.hasSuffix(".json") || p.hasSuffix(".webmanifest") { return "application/json; charset=utf-8" }
        return "application/octet-stream"
    }
}

final class FrameKitViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    private var webView: WKWebView!

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.07, green: 0.08, blue: 0.16, alpha: 1.0)

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.userContentController.add(self, name: "savePhoto")

        if let wwwUrl = Bundle.main.resourceURL?.appendingPathComponent("www") {
            config.setURLSchemeHandler(LocalWebSchemeHandler(wwwRoot: wwwUrl), forURLScheme: "framekit")
        }

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.navigationDelegate = self
        webView.uiDelegate = self
        view.addSubview(webView)

        if let startUrl = URL(string: "framekit://local/index.html") {
            webView.load(URLRequest(url: startUrl))
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            UIApplication.shared.open(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, url.scheme != "framekit", url.scheme != "about", url.scheme != "blob", url.scheme != "data" {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "savePhoto",
              let body = message.body as? [String: Any],
              let b64 = body["base64"] as? String,
              let data = Data(base64Encoded: b64) else { return }

        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else { return }
            PHPhotoLibrary.shared().performChanges({
                let req = PHAssetCreationRequest.forAsset()
                req.addResource(with: .photo, data: data, options: nil)
            })
        }
    }
}
