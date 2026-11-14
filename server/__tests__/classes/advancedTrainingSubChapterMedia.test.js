import {Chapter} from "../../classes/advancedTraining";
import {AdvancedTrainingProgress} from "../../classes/advancedTrainingProgress";
import {
  applySubChapterMedia,
  shouldOpenMediaOnActivate,
} from "../../events/advancedTrainingSubChapterMedia";

const makeChapter = (extra = {}) =>
  new Chapter({
    id: "c",
    subChapters: [
      {id: "a", mediaAsset: "/Training/a.mp4"},
      {id: "b"},
      {id: "c", mediaAsset: "/Training/c.mp4", autoOpenMedia: false},
    ],
    ...extra,
  });
const makeProgress = () =>
  new AdvancedTrainingProgress({clientId: "x", simulatorId: "s"});

describe("sub-chapter media", () => {
  test("defaults and persistence of new fields", () => {
    const ch = makeChapter({transporterTargetCount: 3.7});
    expect(ch.subChapters[0].autoOpenMedia).toBe(true);
    expect(ch.subChapters[1].mediaAsset).toBeNull();
    expect(ch.transporterTargetCount).toBe(3);
    expect(new Chapter().transporterTargetCount).toBe(0);
  });

  test("opens when the next step has auto-open media", () => {
    const p = makeProgress();
    applySubChapterMedia(p, makeChapter(), null, "a");
    expect(p.mediaViewerOpen).toBe(true);
  });

  test("closes when leaving a step with its own media", () => {
    const p = makeProgress();
    p.setMediaViewerOpen(true);
    applySubChapterMedia(p, makeChapter(), "a", "b");
    expect(p.mediaViewerOpen).toBe(false);
  });

  test("leaves the viewer alone when neither step has media", () => {
    const p = makeProgress();
    p.setMediaViewerOpen(true);
    applySubChapterMedia(p, makeChapter(), "b", "b");
    expect(p.mediaViewerOpen).toBe(true);
  });

  test("does not auto-open when autoOpenMedia is off", () => {
    const p = makeProgress();
    applySubChapterMedia(p, makeChapter(), "b", "c");
    expect(p.mediaViewerOpen).toBe(false);
  });

  test("activation opens for first-step media or chapter media", () => {
    expect(shouldOpenMediaOnActivate(makeChapter(), "a")).toBe(true);
    expect(shouldOpenMediaOnActivate(makeChapter(), "b")).toBe(false);
    const withChapterMedia = makeChapter({
      mediaAsset: "/Training/m.mp4",
      autoOpenMedia: true,
    });
    expect(shouldOpenMediaOnActivate(withChapterMedia, "b")).toBe(true);
    expect(shouldOpenMediaOnActivate(makeChapter(), "c")).toBe(false);
  });
});
