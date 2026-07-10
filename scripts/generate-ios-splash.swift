import AppKit

struct SplashSize {
  let name: String
  let width: Int
  let height: Int
}

let sizes = [
  SplashSize(name: "iphone-828x1792", width: 828, height: 1792),
  SplashSize(name: "iphone-1125x2436", width: 1125, height: 2436),
  SplashSize(name: "iphone-1170x2532", width: 1170, height: 2532),
  SplashSize(name: "iphone-1179x2556", width: 1179, height: 2556),
  SplashSize(name: "iphone-1242x2688", width: 1242, height: 2688),
  SplashSize(name: "iphone-1290x2796", width: 1290, height: 2796),
  SplashSize(name: "ipad-1536x2048", width: 1536, height: 2048),
  SplashSize(name: "ipad-1640x2360", width: 1640, height: 2360),
  SplashSize(name: "ipad-1668x2388", width: 1668, height: 2388),
  SplashSize(name: "ipad-2048x2732", width: 2048, height: 2732)
]

let outDir = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
  .appendingPathComponent("assets")

func drawSplash(_ size: SplashSize) {
  let rect = NSRect(x: 0, y: 0, width: size.width, height: size.height)
  let image = NSImage(size: rect.size)
  image.lockFocus()

  let bg = NSGradient(colors: [
    NSColor(calibratedRed: 0.93, green: 0.96, blue: 1.0, alpha: 1),
    NSColor(calibratedRed: 0.98, green: 0.95, blue: 0.98, alpha: 1)
  ])
  bg?.draw(in: rect, angle: 90)

  let accent = NSGradient(colors: [
    NSColor(calibratedRed: 0.66, green: 0.80, blue: 0.95, alpha: 1),
    NSColor(calibratedRed: 0.56, green: 0.88, blue: 0.90, alpha: 1),
    NSColor(calibratedRed: 1.0, green: 0.48, blue: 0.47, alpha: 1)
  ])

  let iconSide = CGFloat(min(size.width, size.height)) * 0.24
  let iconRect = NSRect(
    x: (rect.width - iconSide) / 2,
    y: rect.height * 0.51,
    width: iconSide,
    height: iconSide
  )

  NSGraphicsContext.current?.cgContext.setShadow(
    offset: CGSize(width: 0, height: -18),
    blur: 36,
    color: NSColor(calibratedRed: 0.08, green: 0.14, blue: 0.24, alpha: 0.18).cgColor
  )
  accent?.draw(in: iconRect, angle: -35)
  NSGraphicsContext.current?.cgContext.setShadow(offset: .zero, blur: 0, color: nil)

  let fontName = "Arial Rounded MT Bold"
  let sadFont = NSFont(name: fontName, size: iconSide * 0.27)
    ?? NSFont.systemFont(ofSize: iconSide * 0.27, weight: .heavy)
  let textY = iconRect.midY - sadFont.pointSize * 0.52
  let letterWidth = iconSide * 0.24
  let attrsDark: [NSAttributedString.Key: Any] = [
    .font: sadFont,
    .foregroundColor: NSColor(calibratedRed: 0.02, green: 0.08, blue: 0.36, alpha: 1)
  ]
  let attrsLight: [NSAttributedString.Key: Any] = [
    .font: sadFont,
    .foregroundColor: NSColor.white
  ]

  "S".draw(
    in: NSRect(x: iconRect.midX - letterWidth * 1.6, y: textY, width: letterWidth, height: sadFont.pointSize * 1.2),
    withAttributes: attrsDark
  )
  "A".draw(
    in: NSRect(x: iconRect.midX - letterWidth * 0.38, y: textY, width: letterWidth, height: sadFont.pointSize * 1.2),
    withAttributes: attrsLight
  )
  "D".draw(
    in: NSRect(x: iconRect.midX + letterWidth * 0.9, y: textY, width: letterWidth, height: sadFont.pointSize * 1.2),
    withAttributes: attrsDark
  )

  let smile = NSBezierPath()
  smile.move(to: NSPoint(x: iconRect.midX - iconSide * 0.03, y: iconRect.midY - iconSide * 0.17))
  smile.curve(
    to: NSPoint(x: iconRect.midX + iconSide * 0.15, y: iconRect.midY - iconSide * 0.17),
    controlPoint1: NSPoint(x: iconRect.midX + iconSide * 0.03, y: iconRect.midY - iconSide * 0.25),
    controlPoint2: NSPoint(x: iconRect.midX + iconSide * 0.10, y: iconRect.midY - iconSide * 0.25)
  )
  smile.lineWidth = max(8, iconSide * 0.047)
  smile.lineCapStyle = .round
  NSColor.white.setStroke()
  smile.stroke()

  let titleFont = NSFont.systemFont(ofSize: CGFloat(size.width) * 0.052, weight: .semibold)
  let titleAttrs: [NSAttributedString.Key: Any] = [
    .font: titleFont,
    .foregroundColor: NSColor(calibratedRed: 0.09, green: 0.13, blue: 0.20, alpha: 1)
  ]
  let title = "SAD"
  let titleSize = title.size(withAttributes: titleAttrs)
  title.draw(
    at: NSPoint(x: (rect.width - titleSize.width) / 2, y: rect.height * 0.28),
    withAttributes: titleAttrs
  )

  image.unlockFocus()

  guard
    let tiff = image.tiffRepresentation,
    let rep = NSBitmapImageRep(data: tiff),
    let png = rep.representation(using: .png, properties: [:])
  else {
    fatalError("No se pudo generar \(size.name)")
  }

  let outUrl = outDir.appendingPathComponent("apple-splash-\(size.name).png")
  try! png.write(to: outUrl)
}

for size in sizes {
  drawSplash(size)
}
