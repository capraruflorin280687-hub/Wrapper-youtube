package com.example.ytwrap

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.*
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.ByteArrayInputStream

/** WebView care nu află niciodată că fereastra e ascunsă, deci nu pune media pe pauză. */
class BgWebView(c: Context) : WebView(c) {
    override fun onWindowVisibilityChanged(visibility: Int) {
        if (visibility != View.GONE) super.onWindowVisibilityChanged(View.VISIBLE)
    }
}

class MainActivity : AppCompatActivity() {
    private lateinit var web: BgWebView
    private lateinit var root: FrameLayout
    private lateinit var adJs: String
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null

    private val blockedHosts = listOf(
        "doubleclick.net", "googlesyndication.com", "googleadservices.com"
    )
    private val blockedPaths = listOf("/pagead/", "/api/stats/ads", "&ad_type=")

    private val chrome = object : WebChromeClient() {
        override fun onShowCustomView(view: View, cb: CustomViewCallback) {
            if (customView != null) { cb.onCustomViewHidden(); return }
            customView = view
            customCallback = cb
            web.visibility = View.INVISIBLE
            root.addView(view, FrameLayout.LayoutParams(-1, -1))
            goImmersive()
        }
        override fun onHideCustomView() {
            customView?.let { root.removeView(it) }
            customView = null
            customCallback?.onCustomViewHidden()
            customCallback = null
            web.visibility = View.VISIBLE
            goImmersive()
        }
    }

    @Suppress("DEPRECATION")
    private fun goImmersive() {
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= 28) {
            val lp = window.attributes
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            window.attributes = lp
        }
        val c = WindowInsetsControllerCompat(window, window.decorView)
        c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        c.hide(WindowInsetsCompat.Type.systemBars())
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_FULLSCREEN or
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        )
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)

        // Serviciul rulează cât timp aplicația există, pornit cât încă e în prim-plan
        try {
            startForegroundService(Intent(this, KeepAliveService::class.java))
        } catch (e: Exception) { }

        adJs = assets.open("adblock.js").bufferedReader().readText()
        web = BgWebView(this)
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        root = FrameLayout(this)
        root.setBackgroundColor(0xFF000000.toInt())
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        goImmersive()
        root.post { goImmersive() }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
            userAgentString = userAgentString.replace("; wv", "")
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(
                web, adJs, setOf("https://m.youtube.com", "https://www.youtube.com")
            )
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
        web.webChromeClient = chrome
        web.loadUrl(savedInstanceState?.getString("url") ?: "https://m.youtube.com")
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) goImmersive()
    }

    override fun onStop() {
        super.onStop()
        web.onResume()
        web.resumeTimers()
    }

    override fun onDestroy() {
        stopService(Intent(this, KeepAliveService::class.java))
        super.onDestroy()
    }

    override fun onSaveInstanceState(o: Bundle) {
        super.onSaveInstanceState(o)
        o.putString("url", web.url)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        when {
            customView != null -> chrome.onHideCustomView()
            web.canGoBack() -> web.goBack()
            else -> super.onBackPressed()
        }
    }
}
