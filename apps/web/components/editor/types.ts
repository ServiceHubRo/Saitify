import type { useEditorState, EditResult } from './use-editor';

export type EditorApi = ReturnType<typeof useEditorState>;
/** What is selected on the canvas. `focus` is the content path of a clicked field (e.g. "items.2.title"). */
export type Selection = { sectionId: string; focus?: string } | null;
export type Report = (result: EditResult) => boolean;
export type SnackAction = { text: string };
export const CATEGORY_LABELS: Record<string, string> = {
  navigation: 'Header',
  hero: 'Hero',
  content: 'Content',
  media: 'Gallery & media',
  'social-proof': 'Social proof',
  conversion: 'Call to action',
  contact: 'Contact & location',
  footer: 'Footer',
};
