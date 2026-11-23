#if canImport(Darwin)
  import Foundation
  import KennwortAutofillCore

  /// The App Group shared by the app and its extension; both carry it in their entitlements
  /// (docs/handy.md, "iOS-AutoFill bauen")
  public enum AppGroup {
    public static let id = "group.app.kennwort"
    public static let requestSlot = "autofill-request.json"
    public static let answerSlot = "autofill-answer.json"
    /// Posted by the app after it left an answer; carries nothing, it only wakes the extension
    public static let answered = "app.kennwort.autofill.answered"
  }

  /// A slot as one file in the App Group container, written atomically with complete file
  /// protection (unreadable while the device is locked) and excluded from backups. Nil when the
  /// App Group is missing from the entitlements: then nothing is handed over at all.
  public func groupSlot(_ name: String, group: String = AppGroup.id) -> Slot? {
    guard
      let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: group)
    else { return nil }
    let url = container.appendingPathComponent(name, isDirectory: false)
    return Slot(
      read: { try? Data(contentsOf: url) },
      write: { data in
        do {
          try data.write(to: url, options: [.atomic, .completeFileProtection])
          var file = url
          var values = URLResourceValues()
          values.isExcludedFromBackup = true
          try? file.setResourceValues(values)
          return true
        } catch {
          return false
        }
      },
      remove: { try? FileManager.default.removeItem(at: url) }
    )
  }

  /// A Darwin notification: crosses processes, carries no data
  public func postAnswered() {
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(AppGroup.answered as CFString), nil, nil, true)
  }
#endif
