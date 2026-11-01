import { describe, expect, it } from "vitest"
import { linkPicture, linkWhere, linksWord, projectLinksPath } from "@/lib/work/projectLinks"

// basecamp-16: a project's links, as the strip and the Links dialog read them.

const link = { id: "1b5e0000-0000-4000-8000-000000000001", has_icon: true, has_image: false }

describe("a project link's pictures", () => {
  it("asks the API for a kept icon, with one slash after a base that ends in one", () => {
    expect(linkPicture("p1", link, "icon", "https://api.example.com/")).toBe(
      "https://api.example.com/project/p1/links/1b5e0000-0000-4000-8000-000000000001/icon",
    )
  })

  it("asks for no picture the link doesn't have", () => {
    expect(linkPicture("p1", link, "image", "https://api.example.com")).toBe("")
    expect(linkPicture("p1", { ...link, has_icon: false }, "icon", "https://api.example.com")).toBe("")
  })

  it("asks for the preview picture of a link that has one", () => {
    expect(linkPicture("p1", { ...link, has_image: true }, "image", "https://api.example.com")).toBe(
      "https://api.example.com/project/p1/links/1b5e0000-0000-4000-8000-000000000001/image",
    )
  })

  it("names no host when the API's base is unset", () => {
    expect(linkPicture("p1", link, "icon", "")).toBe("")
  })
})

describe("a project link's words", () => {
  it("says where it goes by its site's name, else by its host", () => {
    expect(linkWhere({ site_name: "Figma", host: "www.figma.com" })).toBe("Figma")
    expect(linkWhere({ site_name: "  ", host: "drive.google.com" })).toBe("drive.google.com")
  })

  it("counts links in words", () => {
    expect(linksWord(1)).toBe("1 link")
    expect(linksWord(4)).toBe("4 links")
  })

  it("reads the project's links from its own address", () => {
    expect(projectLinksPath("p1")).toBe("/project/p1/links")
  })
})
