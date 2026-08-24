import { describe, expect, it } from "vitest"
import { computeResizedDimensions, validateImageFile } from "./image-utils"

describe("computeResizedDimensions", () => {
  it("leaves dimensions unchanged when already under the max edge", () => {
    expect(computeResizedDimensions(400, 300, 1024)).toEqual({
      width: 400,
      height: 300,
    })
  })

  it("leaves dimensions unchanged when exactly at the max edge", () => {
    expect(computeResizedDimensions(1024, 768, 1024)).toEqual({
      width: 1024,
      height: 768,
    })
  })

  it("scales down a landscape image preserving aspect ratio", () => {
    expect(computeResizedDimensions(4000, 2000, 1000)).toEqual({
      width: 1000,
      height: 500,
    })
  })

  it("scales down a portrait image preserving aspect ratio", () => {
    expect(computeResizedDimensions(2000, 4000, 1000)).toEqual({
      width: 500,
      height: 1000,
    })
  })

  it("scales down a square image", () => {
    expect(computeResizedDimensions(3000, 3000, 1024)).toEqual({
      width: 1024,
      height: 1024,
    })
  })
})

describe("validateImageFile", () => {
  function makeFile(type: string, size: number): File {
    return new File([new Uint8Array(size)], "photo", { type })
  }

  it("accepts a small jpeg", () => {
    expect(validateImageFile(makeFile("image/jpeg", 1024))).toBeNull()
  })

  it("accepts png and webp", () => {
    expect(validateImageFile(makeFile("image/png", 1024))).toBeNull()
    expect(validateImageFile(makeFile("image/webp", 1024))).toBeNull()
  })

  it("rejects an unsupported content type", () => {
    expect(validateImageFile(makeFile("image/gif", 1024))).not.toBeNull()
  })

  it("rejects a file over 5MB", () => {
    expect(
      validateImageFile(makeFile("image/jpeg", 5 * 1024 * 1024 + 1))
    ).not.toBeNull()
  })

  it("accepts a file exactly at the 5MB limit", () => {
    expect(
      validateImageFile(makeFile("image/jpeg", 5 * 1024 * 1024))
    ).toBeNull()
  })
})
