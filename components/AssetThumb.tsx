import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { resolvePhotoUriById } from '../lib/mediaLibrary';

type Props = { assetId: string; size: number; borderRadius?: number };

// 一覧に数百枚並ぶことがあるため、表示される分だけidからURIを解決する
export default function AssetThumb({ assetId, size, borderRadius = 8 }: Props) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUri(null);
    resolvePhotoUriById(assetId).then((resolved) => {
      if (!cancelled) setUri(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  const dimensions = { width: size, height: size, borderRadius };
  if (!uri) return <View style={[dimensions, { backgroundColor: '#eee' }]} />;
  return <Image source={{ uri }} style={dimensions} />;
}
