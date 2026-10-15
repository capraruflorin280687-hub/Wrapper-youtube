package com.example.ytwrap

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class AdGuardFilter(private val ctx: Context) {
    @Volatile private var blocked: Set<String> = emptySet()
    @Volatile private var allowed: Set<String> = emptySet()

    private val listUrl = "https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt"

    // Domenii necesare redării: nu se blochează niciodată
    private val never = listOf(
        "youtube.com", "youtu.be", "googlevideo.com", "ytimg.com",
        "ggpht.com", "gstatic.com", "googleapis.com", "google.com"
    )

    fun start() {
        Thread {
            val f = File(ctx.filesDir, "adguard_dns.txt")
            try { if (f.exists()) parse(f) } catch (e: Exception) { }
            val stale = !f.exists() ||
                System.currentTimeMillis() - f.lastModified() > 7L * 24 * 3600 * 1000
            if (stale) {
                try {
                    download(f)
                    parse(f)
                } catch (e: Exception) { }
            }
        }.start()
    }

    private fun download(dest: File) {
        val tmp = File(dest.parentFile, dest.name + ".tmp")
        val c = URL(listUrl).openConnection() as HttpURLConnection
        c.connectTimeout = 10000
        c.readTimeout = 20000
        try {
            c.inputStream.use { input ->
                tmp.outputStream().use { out -> input.copyTo(out) }
            }
        } finally {
            c.disconnect()
        }
        if (tmp.length() > 10000) {
            dest.delete()
            tmp.renameTo(dest)
        } else {
            tmp.delete()
        }
    }

    private fun parse(f: File) {
        val b = HashSet<String>(80000)
        val a = HashSet<String>()
        f.bufferedReader().useLines { lines ->
            for (raw in lines) {
                val line = raw.trim()
                if (line.isEmpty() || line[0] == '!' || line[0] == '#') continue
                val isException = line.startsWith("@@||")
                if (!isException && !line.startsWith("||")) continue
                val body = line.substring(if (isException) 4 else 2)
                val caret = body.indexOf('^')
                if (caret <= 0) continue
                val mods = body.substring(caret + 1)
                if (mods.isNotEmpty() && mods != "\$important") continue
                val d = body.substring(0, caret).lowercase()
                if (!d.all { it.isLetterOrDigit() || it == '.' || it == '-' }) continue
                if (isException) a.add(d) else b.add(d)
            }
        }
        allowed = a
        blocked = b
    }

    fun isBlocked(host: String): Boolean {
        val bl = blocked
        if (bl.isEmpty()) return false
        val h = host.lowercase()
        for (n in never) {
            if (h == n || h.endsWith(".$n")) return false
        }
        val al = allowed
        var s = h
        while (true) {
            if (al.contains(s)) return false
            if (bl.contains(s)) return true
            val i = s.indexOf('.')
            if (i < 0) return false
            s = s.substring(i + 1)
        }
    }
}
