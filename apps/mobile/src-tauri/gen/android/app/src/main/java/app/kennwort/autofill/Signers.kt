package app.kennwort.autofill

import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build

/**
 * K-802: the SHA-256 digests of the certificates an installed app is signed with, as
 * FillTargets.BROWSERS lists them, so an app under a browser's package name but signed by someone
 * else is not taken for that browser. Empty when the app cannot be read: then no webDomain is
 * believed.
 */
object Signers {
  fun of(packageManager: PackageManager, packageName: String): Set<String> = try {
    certificates(packageManager, packageName).map { FillTargets.digest(it.toByteArray()) }.toSet()
  } catch (e: PackageManager.NameNotFoundException) {
    emptySet()
  }

  @Suppress("DEPRECATION")
  private fun certificates(packageManager: PackageManager, packageName: String): List<Signature> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      return packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNATURES).signatures?.toList().orEmpty()
    }
    val info = packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES).signingInfo
      ?: return emptyList()
    // Several signers: all of them sign this APK; one signer: its certificate and the ones it rotated from
    val certificates = if (info.hasMultipleSigners()) info.apkContentsSigners else info.signingCertificateHistory
    return certificates?.toList().orEmpty()
  }
}
