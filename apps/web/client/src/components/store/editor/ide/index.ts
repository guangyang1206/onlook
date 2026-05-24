import { EditorMode, type CodeNavigationTarget, IdeType } from "@onlook/models";
import { IDE } from "@/components/ide";
import { makeAutoObservable } from "mobx";
import { toast } from "@onlook/ui/sonner";
import type { EditorEngine } from "../engine";

export class IdeManager {
    private _codeNavigationOverride: CodeNavigationTarget | null = null;

    constructor(private readonly editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    get codeNavigationOverride() {
        return this._codeNavigationOverride;
    }

    async openCodeBlock(oid: string) {
        try {
            // Get the current branch data
            const activeBranchId = this.editorEngine.branches.activeBranch?.id;
            if (!activeBranchId) {
                console.warn('[IdeManager] No active branch found');
                return;
            }

            const branchData = this.editorEngine.branches.getBranchDataById(activeBranchId);
            if (!branchData) {
                console.warn(`[IdeManager] No branch data found for branchId: ${activeBranchId}`);
                return;
            }

            // Get element metadata
            const metadata = await branchData.codeEditor.getJsxElementMetadata(oid);
            if (!metadata) {
                console.warn(`[IdeManager] No metadata found for OID: ${oid}`);
                return;
            }

            // Create navigation target
            const startLine = metadata.startTag.start.line;
            const startColumn = metadata.startTag.start.column;
            const endTag = metadata.endTag || metadata.startTag;
            const endLine = endTag.end.line;
            const endColumn = endTag.end.column;

            const target: CodeNavigationTarget = {
                filePath: metadata.path,
                range: {
                    start: { line: startLine, column: startColumn },
                    end: { line: endLine, column: endColumn }
                }
            };

            // Set the override to trigger navigation
            this._codeNavigationOverride = target;

            // Switch to code tab
            this.editorEngine.state.editorMode = EditorMode.CODE;

            // Try to open in external IDE (VS Code, Cursor, etc.)
            await this.tryOpenInExternalIde(metadata.path, startLine);
        } catch (error) {
            console.error('[IdeManager] Error opening code block:', error);
        }
    }

    private async tryOpenInExternalIde(filePath: string, line: number): Promise<void> {
        try {
            const ideType = this.editorEngine.state.ideType || IdeType.ONLOOK;
            
            // If using internal editor only, skip external IDE open
            if (ideType === IdeType.ONLOOK) {
                return;
            }

            const ide = IDE.fromType(ideType);
            const ideUrl = ide.getCodeFileCommand(filePath, line);
            
            // Try to open the IDE URL
            window.open(ideUrl, '_blank');
            
            // Show a toast to inform user
            toast.info(`Opening in ${ide.getIdeName()}... If nothing happens, please install ${ide.getIdeName()}.`);
            
            // Heuristic detection: if page is still active after 3 seconds, show warning
            setTimeout(() => {
                toast.dismiss();
                toast.warning(
                    `Unable to detect ${ide.getIdeName()}. ` +
                    `Please install it from ${ide.getDownloadUrl()} and try again.`,
                    { duration: 6000 }
                );
            }, 3000);
        } catch (error) {
            console.error('[IdeManager] Error opening in external IDE:', error);
        }
    }

    clearCodeNavigationOverride() {
        this._codeNavigationOverride = null;
    }

    hasCodeNavigationOverride(): boolean {
        return this._codeNavigationOverride !== null;
    }
}