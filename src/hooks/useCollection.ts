import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface CollectionState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

/** Bir Firestore koleksiyonunu gerçek zamanlı dinler (eski onSnapshot mantığı). */
export function useCollection<T extends { id: string }>(name: string): CollectionState<T> {
  const [state, setState] = useState<CollectionState<T>>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, name),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as T);
        setState({ data, loading: false, error: null });
      },
      (err) => {
        console.error(`"${name}" koleksiyonu okunamadı:`, err);
        setState({ data: [], loading: false, error: 'Veriler okunamadı.' });
      },
    );
    return unsubscribe;
  }, [name]);

  return state;
}
