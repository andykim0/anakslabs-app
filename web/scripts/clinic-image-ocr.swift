import Foundation
import Vision
import ImageIO
import CoreGraphics

func loadCGImage(_ path: String) -> CGImage? {
  let url = URL(fileURLWithPath: path)
  guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
  return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

func jsonEscape(_ source: String) -> String {
  var result = ""
  for character in source.unicodeScalars {
    switch character {
    case "\"": result += "\\\""
    case "\\": result += "\\\\"
    case "\n": result += "\\n"
    case "\r": result += "\\r"
    case "\t": result += "\\t"
    default:
      if character.value < 0x20 {
        result += String(format: "\\u%04x", character.value)
      } else {
        result.unicodeScalars.append(character)
      }
    }
  }
  return result
}

for path in CommandLine.arguments.dropFirst() {
  guard let image = loadCGImage(path) else {
    print("{\"path\":\"\(jsonEscape(path))\",\"error\":\"load_failed\"}")
    continue
  }
  let width = image.width
  let height = image.height
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  let handler = VNImageRequestHandler(cgImage: image, options: [:])
  var lines: [String] = []
  do {
    try handler.perform([request])
    for observation in request.results ?? [] {
      guard let candidate = observation.topCandidates(1).first else { continue }
      let box = observation.boundingBox
      let x = Int(box.minX * CGFloat(width))
      let y = Int((1.0 - box.maxY) * CGFloat(height))
      let boxWidth = Int(box.width * CGFloat(width))
      let boxHeight = Int(box.height * CGFloat(height))
      lines.append(
        "{\"text\":\"\(jsonEscape(candidate.string))\","
          + "\"conf\":\(String(format: "%.3f", candidate.confidence)),"
          + "\"x\":\(x),\"y\":\(y),\"w\":\(boxWidth),\"h\":\(boxHeight)}"
      )
    }
  } catch {
    print("{\"path\":\"\(jsonEscape(path))\",\"error\":\"ocr_failed\"}")
    continue
  }
  print(
    "{\"path\":\"\(jsonEscape(path))\",\"width\":\(width),\"height\":\(height),"
      + "\"lines\":[\(lines.joined(separator: ","))]}"
  )
}
