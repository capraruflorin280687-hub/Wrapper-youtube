package com.example.ytwrap

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.webkit.*
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.ByteArrayInputStream

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var adJs: String

    private val blockedHosts = listOf(
        "doubleclick.net", "googleadservices.com", "googlesyndication.com",
        "google-analytics.com", "adservice.google.com", "imasdk.googleapis.com"
    )
    private val blockedPaths = listOf(
        "/pagead/", "/api/stats/ads", "/ptracking", "/get_midroll_info", "&ad_type="
    )

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)

        adJs = assets.open("adblock.js").bufferedReader().readText()
        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            userAgentString = userAgentString.replace("; wv", "")
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, adJs, setOf("https://m.youtube.com", "https://www.youtube.com"))
        }

        web.webViewClient = object : WebViewClient() {
            override fun onPageStarted(v: WebView, url: String?, f: android.graphics.Bitmap?) {
                if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
                    v.evaluateJavascript(adJs, null)
            }
            override fun shouldInterceptRequest(v: WebView, r: WebResourceRequest): WebResourceResponse? {
                val host = r.url.host ?: ""
                val full = r.url.toString()
                if (blockedHosts.any { host.endsWith(it) } || blockedPaths.any { full.contains(it) })
                    return WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
                return null
            }
            override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                val h = r.url.host ?: ""
                return if (h.endsWith("youtube.com") || h.endsWith("google.com") || h.endsWith("youtu.be")) false
                else { startActivity(Intent(Intent.ACTION_VIEW, r.url)); true }
            }
        }
        web.webChromeClient = WebChromeClient()
        web.loadUrl(savedInstanceState?.getString("url") ?: "https://m.youtube.com")
    }

    override fun onStop() {
        super.onStop()
        startForegroundService(Intent(this, KeepAliveService::class.java))
        web.onResume()
        web.resumeTimers()
    }

    override fun onStart() {
        super.onStart()
        stopService(Intent(this, KeepAliveService::class.java))
    }

    override fun onSaveInstanceState(o: Bundle) { super.onSaveInstanceState(o); o.putString("url", web.url) }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (web.canGoBack()) web.goBack() else super.onBackPressed() }
}
