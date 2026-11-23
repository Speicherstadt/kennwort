import AuthenticationServices
import CryptoKit
import KennwortAutofillApple
import KennwortAutofillCore
import UIKit

/// The AutoFill Credential Provider of Kennwort (docs/plan.md, Entscheidungen "Autofill unter iOS";
/// the Android counterpart is AutofillAuthActivity.kt). iOS opens it only when the person picks
/// Kennwort in the password menu, which is the user action every fill needs. It never holds a key
/// or an entry: it names the host (ServiceIdentifiers.swift), leaves a request without any secret
/// in the App Group and waits. The person switches to Kennwort, unlocks it the normal way and picks
/// an entry that matches the host exactly (matches.ts, as the extension fills by); the app seals the
/// answer to this view's key (Seal.swift) and this view fills exactly that. Leaving without a
/// choice fills nothing.
///
/// No QuickType suggestions: Kennwort registers no credential identities, since the identity store
/// would keep every host and user name on the device unencrypted, and a fill from it would need a
/// password without the app (P-03 keeps no key for that).
final class CredentialProviderViewController: ASCredentialProviderViewController {
  private struct Waiting {
    let request: FillRequest
    let key: Curve25519.KeyAgreement.PrivateKey
  }

  private var waiting: Waiting?
  private var timer: Timer?
  private let message = UILabel()
  private let languages = Locale.preferredLanguages

  private func say(_ key: TextKey) -> String { text(key, languages: languages) }

  // MARK: - What iOS asks

  override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
    let services = serviceIdentifiers.map(serviceIdentifier)
    guard let target = fillTarget(for: services),
      let request = makeRequest(
        requestId: UUID().uuidString, target: target, fields: [.username, .password]),
      let slot = groupSlot(AppGroup.requestSlot)
    else { return show(say(.noTarget)) }
    let key = Seal.newKey()
    groupSlot(AppGroup.answerSlot)?.remove()
    let handover = HandoverRequest(
      createdAt: Date().timeIntervalSince1970, request: requestJSON(request),
      recipientKey: Seal.publicKey(of: key))
    guard put(handover, into: slot) else { return show(say(.noTarget)) }
    waiting = Waiting(request: request, key: key)
    if case .web(let host) = target { show(say(.waiting).replacingOccurrences(of: "{host}", with: host)) }
    listen()
  }

  /// Passkeys are not offered (Info.plist, ProvidesPasskeys is false); should iOS ask anyway, the
  /// person reads why nothing happens and cancels
  override func prepareCredentialList(
    for serviceIdentifiers: [ASCredentialServiceIdentifier],
    requestParameters: ASPasskeyCredentialRequestParameters
  ) {
    show(say(.notSupported))
  }

  /// Never without the person: there is no credential to give without the unlocked app
  override func provideCredentialWithoutUserInteraction(for credentialRequest: any ASCredentialRequest) {
    extensionContext.cancelRequest(withError: ASExtensionError(.userInteractionRequired))
  }

  @available(iOS, deprecated: 17.0)
  override func provideCredentialWithoutUserInteraction(for credentialIdentity: ASPasswordCredentialIdentity) {
    extensionContext.cancelRequest(withError: ASExtensionError(.userInteractionRequired))
  }

  /// Only reached from a QuickType suggestion, and Kennwort registers none
  override func prepareInterfaceToProvideCredential(for credentialRequest: any ASCredentialRequest) {
    extensionContext.cancelRequest(withError: ASExtensionError(.credentialIdentityNotFound))
  }

  @available(iOS, deprecated: 17.0)
  override func prepareInterfaceToProvideCredential(for credentialIdentity: ASPasswordCredentialIdentity) {
    extensionContext.cancelRequest(withError: ASExtensionError(.credentialIdentityNotFound))
  }

  // MARK: - Waiting for the app

  /// The app posts a Darwin notification after it answered; iOS may hold that back while the host
  /// app is in the background, so the view also looks when it comes to the front and every second
  private func listen() {
    let observer = Unmanaged.passUnretained(self).toOpaque()
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(), observer,
      { _, observer, _, _, _ in
        guard let observer else { return }
        let view = Unmanaged<CredentialProviderViewController>.fromOpaque(observer)
          .takeUnretainedValue()
        DispatchQueue.main.async { view.lookForAnswer() }
      }, AppGroup.answered as CFString, nil, .deliverImmediately)
    NotificationCenter.default.addObserver(
      self, selector: #selector(lookForAnswer), name: .NSExtensionHostWillEnterForeground,
      object: nil)
    timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
      self?.lookForAnswer()
    }
  }

  private func stopListening() {
    timer?.invalidate()
    timer = nil
    CFNotificationCenterRemoveEveryObserver(
      CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque())
    NotificationCenter.default.removeObserver(self)
  }

  @objc private func lookForAnswer() {
    guard let current = waiting, let slot = groupSlot(AppGroup.answerSlot), slot.read() != nil,
      let sealed = take(HandoverAnswer.self, from: slot)
    else { return }
    // A sealed answer that does not open for this request and key is not ours: keep waiting
    guard let text = Seal.open(sealed, requestId: current.request.requestId, with: current.key),
      let answer = parseAnswer(text, for: current.request)
    else { return }
    finish(with: answer)
  }

  private func finish(with answer: Answer) {
    waiting = nil
    stopListening()
    groupSlot(AppGroup.requestSlot)?.remove()
    guard case .fill(let values) = answer, let password = values[.password] else {
      return extensionContext.cancelRequest(withError: ASExtensionError(.userCanceled))
    }
    let credential = ASPasswordCredential(user: values[.username] ?? "", password: password)
    extensionContext.completeRequest(withSelectedCredential: credential, completionHandler: nil)
  }

  @objc private func cancelTapped() {
    finish(with: .cancel)
  }

  deinit {
    timer?.invalidate()
    CFNotificationCenterRemoveEveryObserver(
      CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque())
  }

  // MARK: - The view

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    let title = UILabel()
    title.text = say(.title)
    title.font = .preferredFont(forTextStyle: .headline)
    message.numberOfLines = 0
    message.font = .preferredFont(forTextStyle: .body)
    message.adjustsFontForContentSizeCategory = true
    let cancelButton = UIButton(type: .system)
    cancelButton.setTitle(say(.cancel), for: .normal)
    cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
    let stack = UIStackView(arrangedSubviews: [title, message, cancelButton])
    stack.axis = .vertical
    stack.spacing = 16
    stack.alignment = .leading
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
      stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
    ])
  }

  private func show(_ text: String) {
    loadViewIfNeeded()
    message.text = text
  }
}

/// The system's identifier as the core reads it. iOS 17 knows domains and URLs; any kind added
/// later is not guessed at but fills nothing.
private func serviceIdentifier(_ service: ASCredentialServiceIdentifier) -> ServiceIdentifier {
  switch service.type {
  case .domain: return ServiceIdentifier(kind: .domain, identifier: service.identifier)
  case .URL: return ServiceIdentifier(kind: .url, identifier: service.identifier)
  @unknown default: return ServiceIdentifier(kind: .other, identifier: service.identifier)
  }
}
