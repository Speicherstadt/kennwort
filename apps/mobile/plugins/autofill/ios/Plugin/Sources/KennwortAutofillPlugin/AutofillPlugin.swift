import Foundation
import KennwortAutofillApple
import KennwortAutofillCore
import Tauri
import WebKit

struct RespondArgs: Decodable {
  let response: String
}

/// What the plugin resolves with, as AutofillPlugin.kt does: the bridge's JSON text, or null
struct Message: Encodable {
  let message: String?
}

/// The request the person is answering, in memory only: taken from the App Group once, so the
/// slot is empty again as soon as the app has read it
struct Pending {
  let request: FillRequest
  let json: String
  let recipientKey: String
  let createdAt: TimeInterval
}

/// The webview's side of the iOS AutoFill extension (docs/plan.md, Entscheidungen "Autofill unter
/// iOS"), with the same three commands as AutofillPlugin.kt for Android (src-tauri/src/autofill.rs).
/// `pending` takes the extension's request out of the App Group, `respond` checks the person's
/// answer against it, seals it to the extension's key and leaves it for the extension, which fills.
/// iOS has no "Save to Kennwort?" for third-party providers, so `takeSave` never has anything.
/// Nothing here is logged; an answer carries a password.
class AutofillPlugin: Plugin {
  private var pending: Pending?
  private let now: () -> TimeInterval = { Date().timeIntervalSince1970 }

  private func takeRequest() -> Pending? {
    guard let slot = groupSlot(AppGroup.requestSlot),
      let handover = take(HandoverRequest.self, from: slot),
      let request = freshRequest(handover, now: now())
    else { return nil }
    // An answer left for an earlier request has nobody waiting for it any more
    groupSlot(AppGroup.answerSlot)?.remove()
    return Pending(request: request, json: requestJSON(request), recipientKey: handover.recipientKey,
      createdAt: handover.createdAt)
  }

  @objc public func pending(_ invoke: Invoke) {
    // A newer request replaces the one the person had not answered, as PendingFills.kt does
    if let newer = takeRequest() { pending = newer }
    dropStale()
    invoke.resolve(Message(message: pending?.json))
  }

  /// The 3-minute limit holds until the answer, not only until the request is read
  private func dropStale() {
    if let current = pending, now() - current.createdAt > Handover.maxAge { pending = nil }
  }

  @objc public func respond(_ invoke: Invoke) {
    dropStale()
    guard let args = try? invoke.parseArgs(RespondArgs.self), let current = pending,
      let answer = parseAnswer(args.response, for: current.request)
    else { return invoke.reject("no such request") }
    pending = nil
    guard
      let sealed = Seal.seal(
        answerJSON(answer, for: current.request), requestId: current.request.requestId,
        to: current.recipientKey),
      let slot = groupSlot(AppGroup.answerSlot), put(sealed, into: slot)
    else { return invoke.reject("autofill failed") }
    postAnswered()
    invoke.resolve(Message(message: nil))
  }

  @objc public func takeSave(_ invoke: Invoke) {
    invoke.resolve(Message(message: nil))
  }
}

@_cdecl("init_plugin_kennwort_autofill")
func initPlugin() -> Plugin {
  return AutofillPlugin()
}
