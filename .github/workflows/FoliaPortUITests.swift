import XCTest

// External CI harness only: production Folia source ZIP03 remains byte-for-byte frozen.
// Complete the original first-launch screens by real user taps; never seed storage or execute JS.
final class FoliaPortUITests: XCTestCase {
    private var app: XCUIApplication!
    private var recordingFailure = false

    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        app = XCUIApplication(bundleIdentifier: "io.github.fundus0517.folia")
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 45), "原 Folia 必须实际加载 WKWebView")
        try completeOriginalFirstLaunchIfNeeded()
    }

    override func tearDownWithError() throws {
        app?.terminate()
        XCUIDevice.shared.orientation = .portrait
    }

    override func record(_ issue: XCTIssue) {
        if !recordingFailure {
            recordingFailure = true
            captureEvidence("失败现场-\(name)")
            recordingFailure = false
        }
        super.record(issue)
    }

    func testOriginalSettingsCanOpenCloseAndRotate() throws {
        let settings = app.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", "设置", "选项")).firstMatch
        XCTAssertTrue(settings.waitForExistence(timeout: 30), "原 Folia 设置入口必须存在")
        XCTAssertTrue(settings.isHittable, "设置按钮不能被安全区或透明层挡住")
        assertSafeTouch(settings)
        settings.tap()
        let search = app.searchFields["搜索设置"].firstMatch
        let close = app.buttons["关闭"].firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 15), "必须打开原版设置窗口")
        XCTAssertTrue(close.waitForExistence(timeout: 15))
        assertSafeTouch(close)
        attach("原版设置-竖屏")
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(close.waitForExistence(timeout: 15))
        XCTAssertTrue(close.isHittable, "横屏设置关闭按钮必须可触达")
        assertSafeTouch(close)
        attach("原版设置-横屏")
        close.tap()
        XCTAssertTrue(search.waitForNonExistence(timeout: 15))
        XCUIDevice.shared.orientation = .portrait
        XCTAssertTrue(settings.waitForExistence(timeout: 15))
        XCTAssertTrue(settings.isHittable)
        assertSafeTouch(settings)
        attach("原版首页-竖屏")
    }

    func testOriginalWebViewSurvivesRepeatedRotation() throws {
        let orientations: [UIDeviceOrientation] = [.landscapeLeft, .portrait, .landscapeRight, .portrait]
        for orientation in orientations {
            XCUIDevice.shared.orientation = orientation
            XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15))
            XCTAssertEqual(app.state, .runningForeground)
        }
        attach("原版首页-旋转后")
    }

    private enum StartupSurface: String, Hashable {
        case releaseNotes, libraryChoice, playbackChoice, ponderGate, ponderTutorial, home
    }

    private enum HarnessFailure: Error {
        case firstLaunch(String)
    }

    private var settingsEntry: XCUIElement {
        app.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", "设置", "选项")).firstMatch
    }

    private var tutorialExit: XCUIElement {
        // The original button includes a visible/accessibility Esc keycap before the Chinese text.
        app.buttons.matching(NSPredicate(format: "label ENDSWITH %@", "退出")).firstMatch
    }

    private func currentStartupSurface() -> StartupSurface? {
        if app.staticTexts["版本更新"].firstMatch.exists { return .releaseNotes }
        if app.staticTexts["资料库用哪种界面？"].firstMatch.exists { return .libraryChoice }
        if app.staticTexts["点击播放后进入哪个视图？"].firstMatch.exists { return .playbackChoice }
        if app.staticTexts["认识思索模式"].firstMatch.exists { return .ponderGate }
        if app.staticTexts["认识 Folia"].firstMatch.exists && tutorialExit.exists { return .ponderTutorial }
        if settingsEntry.exists && settingsEntry.isHittable { return .home }
        return nil
    }

    private func waitForStartupSurface() throws -> StartupSurface {
        var surface: StartupSurface?
        var homeVisibleSince: Date?
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { [self] _, _ in
            guard let candidate = currentStartupSurface() else {
                homeVisibleSince = nil
                return false
            }
            if candidate == .home {
                // Do not accept the first frame behind a not-yet-mounted startup effect.
                // Completed installs pay only this stable-home check, not five unconditional waits.
                guard let since = homeVisibleSince else {
                    homeVisibleSince = Date()
                    return false
                }
                guard Date().timeIntervalSince(since) >= 1 else { return false }
            } else {
                homeVisibleSince = nil
            }
            surface = candidate
            return true
        }, object: nil)
        guard XCTWaiter.wait(for: [ready], timeout: 45) == .completed, let surface else {
            try failFirstLaunch("未知启动遮挡：未找到原版首启页面或可触达的设置入口")
        }
        return surface
    }

    private func completeOriginalFirstLaunchIfNeeded() throws {
        var completed = Set<StartupSurface>()
        for _ in 0..<8 {
            let surface = try waitForStartupSurface()
            if surface == .home {
                print("NATIVE_FIRST_LAUNCH_UI_READY: 原版首页设置可触达；实际处理步骤=\(completed.map(\.rawValue).sorted())")
                captureEvidence("首启完成-原版首页")
                return
            }
            guard completed.insert(surface).inserted else {
                try failFirstLaunch("原版首启页面重复出现：\(surface.rawValue)")
            }
            captureEvidence("首启-\(surface.rawValue)-点击前")
            switch surface {
            case .releaseNotes:
                // Only close after verifying this exact original release-notes title.
                // Its header X and footer are the two original buttons both labelled 关闭.
                let title = app.staticTexts["版本更新"].firstMatch
                let closes = app.buttons.matching(NSPredicate(format: "label == %@", "关闭"))
                let button = closes.allElementsBoundByIndex.last(where: { $0.exists && $0.isHittable })
                guard title.exists, let button else {
                    try failFirstLaunch("版本更新页面缺少可触达的关闭按钮")
                }
                button.tap()
                try requireGone(title, "版本更新必须在真实点击关闭后消失")
            case .libraryChoice:
                let title = app.staticTexts["资料库用哪种界面？"].firstMatch
                // Keep the original default Bravais choice, without injecting or changing storage.
                try tapExactStartupButton("下一步")
                try requireGone(title, "资料库首启提问必须进入下一页")
            case .playbackChoice:
                let title = app.staticTexts["点击播放后进入哪个视图？"].firstMatch
                try tapExactStartupButton("就这样")
                try requireGone(title, "播放视图首启提问必须在确认后消失")
            case .ponderGate:
                let title = app.staticTexts["认识思索模式"].firstMatch
                try tapExactStartupButton("思索当前页面")
                try requireGone(title, "思索首启入口必须在点击后打开原版教程")
            case .ponderTutorial:
                let title = app.staticTexts["认识 Folia"].firstMatch
                try requireHittable(tutorialExit, "原版思索教程退出按钮必须可触达")
                tutorialExit.tap()
                try requireGone(title, "原版思索教程必须在退出后消失")
            case .home:
                break
            }
            print("NATIVE_FIRST_LAUNCH_UI_ACTION: \(surface.rawValue)；原版可见按钮已实际点击")
        }
        try failFirstLaunch("原版首启未在有限步骤内完成")
    }

    private func tapExactStartupButton(_ label: String) throws {
        let button = app.buttons.matching(NSPredicate(format: "label == %@", label)).firstMatch
        try requireHittable(button, "原版首启按钮必须可触达：\(label)")
        button.tap()
    }

    private func requireHittable(_ element: XCUIElement, _ message: String) throws {
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            element.exists && element.isHittable
        }, object: nil)
        guard XCTWaiter.wait(for: [ready], timeout: 30) == .completed else {
            try failFirstLaunch(message)
        }
    }

    private func requireGone(_ element: XCUIElement, _ message: String) throws {
        guard element.waitForNonExistence(timeout: 30) else {
            try failFirstLaunch(message)
        }
    }

    private func failFirstLaunch(_ message: String) throws -> Never {
        captureEvidence("首启失败-未知或不可操作页面")
        XCTFail(message)
        throw HarnessFailure.firstLaunch(message)
    }

    private func captureEvidence(_ name: String) {
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
        if let app {
            let hierarchy = XCTAttachment(string: app.debugDescription)
            hierarchy.name = "\(name)-可访问性层级"
            hierarchy.lifetime = .keepAlways
            add(hierarchy)
        }
    }

    private func attach(_ name: String) {
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = name
        image.lifetime = .keepAlways
        add(image)
    }

    private func assertSafeTouch(_ element: XCUIElement) {
        let window = app.windows.firstMatch.frame
        let frame = element.frame
        let landscape = window.width > window.height
        let side: CGFloat = landscape ? 62 : 0
        let top: CGFloat = landscape ? 0 : 62
        let bottom: CGFloat = landscape ? 21 : 34
        XCTAssertGreaterThanOrEqual(frame.minX, window.minX + side - 1)
        XCTAssertGreaterThanOrEqual(frame.minY, window.minY + top - 1)
        XCTAssertLessThanOrEqual(frame.maxX, window.maxX - side + 1)
        XCTAssertLessThanOrEqual(frame.maxY, window.maxY - bottom + 1)
        XCTAssertGreaterThanOrEqual(frame.width, 43.5)
        XCTAssertGreaterThanOrEqual(frame.height, 43.5)
    }
}
