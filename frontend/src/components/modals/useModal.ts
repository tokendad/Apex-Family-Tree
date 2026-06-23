import { useModalStore } from './modalStore';
import type { ModalResult } from './modalTypes';

export function useModal() {
  const { push, pop } = useModalStore();

  function openModal<T>(
    component: string,
    props: Record<string, unknown> = {}
  ): Promise<ModalResult<T>> {
    return new Promise((resolve) => {
      push({
        component,
        props,
        resolve: resolve as (r: ModalResult<unknown>) => void,
      });
    });
  }

  function closeModal(id: string, result: ModalResult<unknown>): void {
    pop(id, result);
  }

  return { openModal, closeModal };
}
