/**
 * 内置示例设备快照（合成数据，用于 `bloatlens demo` 与单元测试）
 *
 * 说明：这是一份完全合成的样本，模拟一台 Sony Bravia Android TV 的 adb 输出，
 * 不含任何真实设备序列号、账号或隐私信息，可安全随包分发。
 */

export const SAMPLE_GETPROP = `[ro.product.brand]: [Sony]
[ro.product.manufacturer]: [Sony]
[ro.product.model]: [BRAVIA 4K GB]
[ro.product.device]: [BRAVIA_ATV3_4K]
[ro.build.characteristics]: [tv]
[ro.build.version.sdk]: [33]
[ro.product.system.brand]: [Sony]
`;

export const SAMPLE_PACKAGES = `package:/system/priv-app/TelemetrySvc/TelemetrySvc.apk=com.sony.tv.telemetry
package:/system/priv-app/AdService/AdService.apk=com.sony.tv.adservice
package:/system/priv-app/UsageMetrics/UsageMetrics.apk=com.sony.tv.usagereport
package:/system/app/ContentRowProvider/ContentRowProvider.apk=com.sony.tv.contentrow
package:/system/app/CrashReportAgent/CrashReportAgent.apk=com.sony.tv.crashreport
package:/system/app/PushSdk/PushSdk.apk=com.sony.tv.pushsdk
package:/system/app/OtaUpdate/OtaUpdate.apk=com.sony.tv.ota.svc
package:/system/app/VoiceAssist/VoiceAssist.apk=com.sony.tv.voice.assist
package:/system/app/PartnerPortal/PartnerPortal.apk=com.sony.tv.partner.app
package:/system/priv-app/SystemUI/SystemUI.apk=com.android.systemui
package:/system/priv-app/Settings/Settings.apk=com.android.settings
package:/system/framework/framework-res.apk=android
package:/system/priv-app/GmsCore/GmsCore.apk=com.google.android.gms
package:/system/priv-app/GoogleServicesFramework/GoogleServicesFramework.apk=com.google.android.gsf
package:/system/priv-app/Phonesky/Phonesky.apk=com.android.vending
package:/system/app/TvLauncher/TvLauncher.apk=com.google.android.tungsten.home
package:/system/app/Bluetooth/Bluetooth.apk=com.android.bluetooth
package:/system/priv-app/MediaProvider/MediaProvider.apk=com.android.providers.media
package:/system/app/PreloadStore/PreloadStore.apk=com.sony.tv.preload
package:/system/app/TrackingAgent/TrackingAgent.apk=com.sony.tv.tracking
package:/system/app/Diagnostics/Diagnostics.apk=com.sony.tv.diagnostics
package:/system/app/Attribution/Attribution.apk=com.sony.tv.attribution
package:/data/app/com.netflix.ninja-1/base.apk=com.netflix.ninja
package:/data/app/org.videolan.vlc/base.apk=org.videolan.vlc
package:/system/app/TelemetrySvcDisabled/TelemetrySvcDisabled.apk=com.sony.tv.telemetry.legacy
`;

export const SAMPLE_DISABLED = `package:com.sony.tv.telemetry.legacy
`;

/**
 * 精简版 dumpsys，演示依赖证据：
 *  - com.sony.tv.contentrow 与 com.sony.tv.partner.app 共享 uid（强耦合）
 *  - com.google.android.tungsten.home uses-library com.google.android.gms（桌面依赖 GMS）
 */
export const SAMPLE_DUMPSYS = `Package [com.sony.tv.contentrow]
  userId=10123
  sharedUserId=com.sony.tv.shared
  requested permissions:
    android.permission.ACCESS_FINE_LOCATION
    android.permission.READ_PHONE_STATE

Package [com.sony.tv.partner.app]
  userId=10123
  sharedUserId=com.sony.tv.shared
  requested permissions:
    android.permission.ACCESS_COARSE_LOCATION

Package [com.google.android.tungsten.home]
  userId=10089
  usesLibraries:
    com.google.android.gms
  requested permissions:
    android.permission.RECORD_AUDIO

Package [com.sony.tv.pushsdk]
  userId=10155
  requested permissions:
    android.permission.READ_PHONE_STATE
    android.permission.RECEIVE_BOOT_COMPLETED
  receiver com.sony.tv.pushsdk.BootReceiver:
    action: android.intent.action.BOOT_COMPLETED
`;
