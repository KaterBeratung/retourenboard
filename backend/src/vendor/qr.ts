import QRCode from 'qrcode';
export const qrDataUrl = (uri:string,{margin=2}:{margin?:number}={}):Promise<string> => QRCode.toDataURL(uri,{width:256,margin,errorCorrectionLevel:'M'});
