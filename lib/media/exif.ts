export interface ExifData {
  make?: string;
  model?: string;
  software?: string;
  dateTimeOriginal?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export async function extractExif(buffer: Buffer, mimeType: string): Promise<ExifData | null> {
  if (!mimeType.startsWith('image/')) return null;
  try {
    const exifr = (await import('exifr')).default;
    const raw = await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      icc: false,
      iptc: false,
      pick: ['Make', 'Model', 'Software', 'DateTimeOriginal', 'GPSLatitude', 'GPSLongitude', 'ImageWidth', 'ImageHeight'],
    });
    if (!raw) return null;
    return {
      make: raw.Make,
      model: raw.Model,
      software: raw.Software,
      dateTimeOriginal: raw.DateTimeOriginal?.toISOString?.(),
      gpsLatitude: raw.GPSLatitude,
      gpsLongitude: raw.GPSLongitude,
      width: raw.ImageWidth,
      height: raw.ImageHeight,
    };
  } catch {
    return null;
  }
}
