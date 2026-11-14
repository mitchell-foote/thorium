import type {AdvancedTrainingProgress} from "../classes/advancedTrainingProgress";

// Per-sub-chapter media. A sub-chapter may carry its own mediaAsset (size and
// position are inherited from the chapter). Call this whenever the active
// sub-chapter changes so the viewer follows the crew step by step.
export function applySubChapterMedia(
  progress: AdvancedTrainingProgress,
  chapter: any,
  prevSubId: string | null,
  nextSubId: string | null,
) {
  const next = nextSubId ? chapter?.getSubChapter?.(nextSubId) : null;
  const prev = prevSubId ? chapter?.getSubChapter?.(prevSubId) : null;
  if (next?.mediaAsset && next.autoOpenMedia) {
    progress.setMediaViewerOpen(true);
  } else if (prev?.mediaAsset && prev.id !== next?.id) {
    // Leaving a step that had its own media: close its viewer.
    progress.setMediaViewerOpen(false);
  }
}

// Should the viewer open when a chapter is first activated?
export function shouldOpenMediaOnActivate(
  chapter: any,
  firstSubId: string | null,
): boolean {
  const first = firstSubId ? chapter?.getSubChapter?.(firstSubId) : null;
  if (first?.mediaAsset) {
    return !!first.autoOpenMedia;
  }
  return !!(chapter?.autoOpenMedia && chapter?.mediaAsset);
}
