/** Decode trusted inline image formats without a network request (or a CSP exception). */
export function imageDataUrlToBlob(image: string): Blob {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match || match[2].length > 12_000_000) throw new Error('This frame is not a supported PNG, JPEG, or WebP image.');
  let binary: string;
  try {
    binary=atob(match[2]);
    if (!binary.length || btoa(binary)!==match[2]) throw new Error('Invalid base64');
  } catch {throw new Error('This frame contains invalid image data.');}
  const bytes=new Uint8Array(binary.length);
  for(let index=0;index<binary.length;index++) bytes[index]=binary.charCodeAt(index);
  const signatureMatches=match[1]==='png'
    ? [137,80,78,71,13,10,26,10].every((byte,index)=>bytes[index]===byte)
    : match[1]==='jpeg'
      ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255
      : String.fromCharCode(...bytes.subarray(0,4))==='RIFF' && String.fromCharCode(...bytes.subarray(8,12))==='WEBP';
  if (!signatureMatches) throw new Error('The frame contents do not match its image format.');
  return new Blob([bytes],{type:`image/${match[1]}`});
}
