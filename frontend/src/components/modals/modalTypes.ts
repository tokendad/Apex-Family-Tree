export type ModalResult<T> =
  | { action: 'created' | 'updated' | 'selected'; entityType: string; entity: T }
  | { action: 'cancelled' };

export interface ModalConfig {
  id: string;
  component: string;
  props: Record<string, unknown>;
  resolve: (result: ModalResult<unknown>) => void;
}

export interface ModalEditorProps {
  modalId: string;
  onClose: (result: ModalResult<unknown>) => void;
}
