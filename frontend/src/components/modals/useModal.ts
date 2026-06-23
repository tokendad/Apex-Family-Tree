import { useModalStore } from './modalStore';
import type { ModalResult } from './modalTypes';

export function useModal() {
  const { push } = useModalStore();

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

  return { openModal };
}
