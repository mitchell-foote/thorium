import React from "react";
import {
  Button,
  Input,
  Label,
  FormGroup,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "helpers/reactstrap";
import FileExplorer from "components/views/TacticalMap/fileExplorer";
import {ChapterEditor, emptyChapter} from "./ChapterEditor";
import InFlightChaptersSection from "./InFlightChaptersSection";
import RecordActionsModal from "./RecordActionsModal";
import type {useAdvancedTrainingConfigEditor} from "./useAdvancedTrainingConfigEditor";

type PickerKind = "regular" | "login" | "completion" | "inflight";

// Encode which chapter (or sub-chapter) the media picker is choosing a file for.
// Chapter keys keep their legacy shape ("<id>" or "<kind>:<id>"); sub-chapter
// keys are "sub|<kind>|<chapterId>|<subId>".
function pickerKey(kind: PickerKind, chapterId: string, subId?: string) {
  if (subId) {
    return `sub|${kind}|${chapterId}|${subId}`;
  }
  return kind === "regular" ? chapterId : `${kind}:${chapterId}`;
}

function parsePickerKey(key: string): {
  kind: PickerKind;
  chapterId: string;
  subId?: string;
} {
  if (key.startsWith("sub|")) {
    const [, kind, chapterId, subId] = key.split("|");
    return {kind: kind as PickerKind, chapterId, subId};
  }
  return {kind: "regular", chapterId: key};
}

interface AdvancedTrainingEditorProps {
  editor: ReturnType<typeof useAdvancedTrainingConfigEditor>;
  stationCards: any[];
  sequentialChapters: boolean;
  simulatorId: string;
  stationSetId: string;
  stationName: string;
}

// The "edit chapters" UI for the Advanced Training config page: training-wide
// settings, the optional login/completion chapters, the regular chapter list,
// the in-flight help section, and the media-picker / action-recording modals.
// All state and handlers come from the editor hook passed in as a prop.
const AdvancedTrainingEditor: React.FC<AdvancedTrainingEditorProps> = ({
  editor,
  stationCards,
  sequentialChapters,
  simulatorId,
  stationSetId,
  stationName,
}) => {
  const {
    displayChapters,
    editingInFlightChapters,
    editingSequential,
    setEditingSequential,
    editingStripPosition,
    setEditingStripPosition,
    editingLogin,
    setEditingLoginChapter,
    editingCompletion,
    setEditingCompletionChapter,
    expandedChapter,
    toggleExpand,
    setExpandedChapter,
    mediaPickerChapter,
    setMediaPickerChapter,
    saveEditing,
    cancelEditing,
    addChapter,
    removeChapter,
    updateChapter,
    addInFlightChapter,
    removeInFlightChapter,
    updateInFlightChapter,
    addSubChapter,
    removeSubChapter,
    updateSubChapter,
    recordingSubChapter,
    recordingChapter,
    recordingSubChapterData,
    startRecording,
    cancelRecording,
    saveRecording,
  } = editor;

  return (
    <>
      <FormGroup
        style={{
          marginBottom: "12px",
          display: "flex",
          gap: "24px",
          flexWrap: "wrap",
        }}
      >
        <Label check style={{display: "flex", gap: "8px", fontWeight: 500}}>
          <input
            type="checkbox"
            checked={editingSequential ?? sequentialChapters}
            onChange={e => setEditingSequential(e.target.checked)}
          />
          Sequential chapters (lock until previous complete)
        </Label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontWeight: 500,
          }}
        >
          Training bar:
          <Label
            check
            style={{
              display: "flex",
              gap: "4px",
              marginBottom: 0,
              fontWeight: 400,
            }}
          >
            <input
              type="radio"
              checked={(editingStripPosition ?? "bottom") === "bottom"}
              onChange={() => setEditingStripPosition("bottom")}
            />
            Bottom
          </Label>
          <Label
            check
            style={{
              display: "flex",
              gap: "4px",
              marginBottom: 0,
              fontWeight: 400,
            }}
          >
            <input
              type="radio"
              checked={(editingStripPosition ?? "bottom") === "top"}
              onChange={() => setEditingStripPosition("top")}
            />
            Top
          </Label>
        </div>
      </FormGroup>

      {/* Login chapter */}
      <div style={{marginBottom: "12px"}}>
        <Label
          check
          style={{
            display: "flex",
            gap: "8px",
            fontWeight: 500,
            marginBottom: "6px",
          }}
        >
          <input
            type="checkbox"
            checked={!!editingLogin}
            onChange={e => {
              if (e.target.checked) {
                setEditingLoginChapter(
                  emptyChapter(`login-${Date.now()}`, "Login Chapter"),
                );
              } else {
                setEditingLoginChapter(null);
                if (expandedChapter === editingLogin?.id) {
                  setExpandedChapter(null);
                }
              }
            }}
          />
          Login Chapter (shown on login screen before training starts)
        </Label>
        {editingLogin && (
          <>
            <div
              style={{
                paddingLeft: "24px",
                marginBottom: "8px",
                fontSize: "13px",
              }}
            >
              <div style={{fontWeight: 500, marginBottom: "4px"}}>
                Station Login
              </div>
              {(["none", "immediate", "on-complete"] as const).map(opt => (
                <Label
                  key={opt}
                  check
                  style={{
                    display: "flex",
                    gap: "6px",
                    marginBottom: "3px",
                    fontWeight: 400,
                  }}
                >
                  <input
                    type="radio"
                    name={`autoLogin-${editingLogin.id}`}
                    value={opt}
                    checked={(editingLogin.autoLogin ?? "none") === opt}
                    onChange={() =>
                      setEditingLoginChapter((prev: any) => ({
                        ...prev,
                        autoLogin: opt,
                      }))
                    }
                  />
                  {opt === "none" && "None (crew logs in manually)"}
                  {opt === "immediate" && "Auto-login when training starts"}
                  {opt === "on-complete" &&
                    "Auto-login after login chapter completes"}
                </Label>
              ))}
            </div>
            <ChapterEditor
              chapter={editingLogin}
              index={-1}
              label={`Login: ${editingLogin.name}`}
              stationCards={stationCards}
              isExpanded={expandedChapter === editingLogin.id}
              onToggleExpand={() => toggleExpand(editingLogin.id)}
              onUpdate={updates =>
                setEditingLoginChapter((prev: any) => ({...prev, ...updates}))
              }
              onAddSubChapter={() => addSubChapter(editingLogin.id, "login")}
              onRemoveSubChapter={subId =>
                removeSubChapter(editingLogin.id, subId, "login")
              }
              onUpdateSubChapter={(subId, updates) =>
                updateSubChapter(editingLogin.id, subId, updates, "login")
              }
              onStartRecording={subId => startRecording(editingLogin.id, subId)}
              onSetMediaPicker={subId =>
                setMediaPickerChapter(
                  pickerKey("login", editingLogin.id, subId),
                )
              }
              showCardSelector={false}
              isLoginChapter
            />
          </>
        )}
      </div>

      {/* Regular chapters */}
      {displayChapters?.map((chapter: any, chIdx: number) => (
        <ChapterEditor
          key={chapter.id}
          chapter={chapter}
          index={chIdx}
          stationCards={stationCards}
          isExpanded={expandedChapter === chapter.id}
          onToggleExpand={() => toggleExpand(chapter.id)}
          onUpdate={updates => updateChapter(chapter.id, updates)}
          onRemove={() => removeChapter(chapter.id)}
          onAddSubChapter={() => addSubChapter(chapter.id)}
          onRemoveSubChapter={subId => removeSubChapter(chapter.id, subId)}
          onUpdateSubChapter={(subId, updates) =>
            updateSubChapter(chapter.id, subId, updates)
          }
          onStartRecording={subId => startRecording(chapter.id, subId)}
          onSetMediaPicker={subId =>
            setMediaPickerChapter(pickerKey("regular", chapter.id, subId))
          }
        />
      ))}

      {/* In-flight help chapters */}
      <InFlightChaptersSection
        chapters={editingInFlightChapters || []}
        stationCards={stationCards}
        expandedChapter={expandedChapter}
        onToggleExpand={toggleExpand}
        onAdd={addInFlightChapter}
        onRemove={removeInFlightChapter}
        onUpdate={updateInFlightChapter}
        onAddSubChapter={chapterId => addSubChapter(chapterId, "inflight")}
        onRemoveSubChapter={(chapterId, subId) =>
          removeSubChapter(chapterId, subId, "inflight")
        }
        onUpdateSubChapter={(chapterId, subId, updates) =>
          updateSubChapter(chapterId, subId, updates, "inflight")
        }
        onStartRecording={(chapterId, subId) =>
          startRecording(chapterId, subId)
        }
        onSetMediaPicker={(chapterId, subId) =>
          setMediaPickerChapter(pickerKey("inflight", chapterId, subId))
        }
      />

      {/* Completion chapter */}
      <div style={{marginTop: "8px", marginBottom: "12px"}}>
        <Label
          check
          style={{
            display: "flex",
            gap: "8px",
            fontWeight: 500,
            marginBottom: "6px",
          }}
        >
          <input
            type="checkbox"
            checked={!!editingCompletion}
            onChange={e => {
              if (e.target.checked) {
                setEditingCompletionChapter(
                  emptyChapter(`completion-${Date.now()}`, "Training Complete"),
                );
              } else {
                setEditingCompletionChapter(null);
                if (expandedChapter === editingCompletion?.id) {
                  setExpandedChapter(null);
                }
              }
            }}
          />
          Completion Chapter (shown after all chapters are finished)
        </Label>
        {editingCompletion && (
          <ChapterEditor
            chapter={editingCompletion}
            index={displayChapters?.length || 0}
            label={`Completion: ${editingCompletion.name}`}
            stationCards={stationCards}
            isExpanded={expandedChapter === editingCompletion.id}
            onToggleExpand={() => toggleExpand(editingCompletion.id)}
            onUpdate={updates =>
              setEditingCompletionChapter((prev: any) => ({
                ...prev,
                ...updates,
              }))
            }
            onAddSubChapter={() =>
              addSubChapter(editingCompletion.id, "completion")
            }
            onRemoveSubChapter={subId =>
              removeSubChapter(editingCompletion.id, subId, "completion")
            }
            onUpdateSubChapter={(subId, updates) =>
              updateSubChapter(
                editingCompletion.id,
                subId,
                updates,
                "completion",
              )
            }
            onStartRecording={subId =>
              startRecording(editingCompletion.id, subId)
            }
            onSetMediaPicker={subId =>
              setMediaPickerChapter(
                pickerKey("completion", editingCompletion.id, subId),
              )
            }
            showCardSelector={false}
          />
        )}
      </div>

      <div style={{display: "flex", gap: "8px", marginTop: "8px"}}>
        <Button size="sm" color="success" outline onClick={addChapter}>
          + Add Chapter
        </Button>
        <Button size="sm" color="primary" onClick={saveEditing}>
          Save
        </Button>
        <Button size="sm" color="secondary" outline onClick={cancelEditing}>
          Cancel
        </Button>
      </div>

      {/* Media picker modal */}
      <Modal
        isOpen={!!mediaPickerChapter}
        toggle={() => setMediaPickerChapter(null)}
      >
        <ModalHeader toggle={() => setMediaPickerChapter(null)}>
          Select Training Media
        </ModalHeader>
        <ModalBody>
          <FileExplorer
            directory="/Training"
            selectedFiles={[]}
            onClick={(_evt: any, container: any) => {
              if (mediaPickerChapter) {
                const target = parsePickerKey(mediaPickerChapter);
                if (target.subId) {
                  updateSubChapter(
                    target.chapterId,
                    target.subId,
                    {mediaAsset: container.fullPath},
                    target.kind === "regular" ? undefined : target.kind,
                  );
                  setMediaPickerChapter(null);
                  return;
                }
                const isLogin = mediaPickerChapter.startsWith("login:");
                const isCompletion =
                  mediaPickerChapter.startsWith("completion:");
                const isInFlight = mediaPickerChapter.startsWith("inflight:");
                if (isLogin) {
                  setEditingLoginChapter((prev: any) => ({
                    ...prev,
                    mediaAsset: container.fullPath,
                  }));
                } else if (isCompletion) {
                  setEditingCompletionChapter((prev: any) => ({
                    ...prev,
                    mediaAsset: container.fullPath,
                  }));
                } else if (isInFlight) {
                  updateInFlightChapter(
                    mediaPickerChapter.slice("inflight:".length),
                    {mediaAsset: container.fullPath},
                  );
                } else {
                  updateChapter(mediaPickerChapter, {
                    mediaAsset: container.fullPath,
                  });
                }
              }
              setMediaPickerChapter(null);
            }}
          />
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setMediaPickerChapter(null)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Record actions modal */}
      <RecordActionsModal
        isOpen={!!recordingSubChapter}
        chapter={recordingChapter}
        existingActions={recordingSubChapterData?.requiredActions || []}
        simulatorId={simulatorId}
        stationSetId={stationSetId}
        stationName={stationName}
        onSave={saveRecording}
        onCancel={cancelRecording}
      />
    </>
  );
};

export default AdvancedTrainingEditor;
