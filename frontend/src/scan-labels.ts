import {BrowserMultiFormatReader} from '@zxing/browser';
import {DecodeHintType,NotFoundException} from '@zxing/library';
import {html,t,addTranslations,setText,apiError} from './i18n.js';
import {h,icon} from './ui.js';
import {captureAuthContext} from './auth-context.js';
import {createPdfSerialSession,createPdfPreviewSession,type PdfSerialCandidate} from './pdf-serial-scan.js';
import {decodeBarcodeImage,decodeBarcodeFrame,cameraFrameRegion} from './barcode-image.js';
import {createSerialOcrSession} from './serial-ocr.js';
import {normalizeScanRegion,scanCanvasSize,mapScanBounds,createScanPhotoSession,createScanCandidateSelection,type ScanBounds} from './scan-preview.js';
import {stopReturnLabel} from './return-labels.js';
export {printReturnLabel,renderReturnLabelDocument,stopReturnLabel} from './return-labels.js';

addTranslations({
  'Code auswählen:':'Select code:','Ausgewählte Codes:':'Selected codes:',
  'Gewählte Codes übernehmen':'Use selected codes','Die Codes konnten nicht übernommen werden.':'The codes could not be used.',
  'Prüfe die Codes und markiere die Werte, die du übernehmen möchtest.':'Check the codes and select the values you want to use.',
  'Originalvorschau':'Original preview','Original zum Prüfen der Erkennung':'Original for checking recognition',
  'Ausschnitt':'Crop','Links (%)':'Left (%)','Oben (%)':'Top (%)','Breite (%)':'Width (%)','Höhe (%)':'Height (%)',
  'Bereich im Foto ziehen oder die Prozentwerte ändern. Danach den Ausschnitt lesen.':'Drag an area in the photo or change the percentages. Then read the crop.',
  'Ausschnitt lesen':'Read crop','Ganzes Foto':'Entire photo','Im Original prüfen':'Check in original',
  'Fundstelle markiert. Erkannten Text mit dem Original vergleichen.':'Location highlighted. Compare the recognized text with the original.',
  'Keine eindeutige Fundstelle verfügbar. Code im Original prüfen.':'No clear location available. Check the code in the original.',
  'Vorschau wird geladen …':'Loading preview …','Die Originalvorschau konnte nicht geladen werden.':'The original preview could not be loaded.',
  'OCR-Sicherheit:':'OCR confidence:','% · bitte prüfen':'% · please check',
  'Texterkennung:':'Text recognition:','Barcodes werden gelesen:':'Reading barcodes:',
  'PDF-Seite':'PDF page','von':'of','wird gelesen …':'being read …',
  'PDF-Seite für die Vorschau':'PDF page for preview',
  'Das Foto hat mehr als 64 Megapixel oder zu große Bildmaße. Bitte verkleinere es und wähle es erneut.':'The photo exceeds 64 megapixels or has excessive dimensions. Resize it and choose it again.',
  'Die Bildmaße konnten nicht sicher geprüft werden. Bitte exportiere das Foto erneut als JPEG, PNG oder WebP.':'The image dimensions could not be checked safely. Export the photo again as JPEG, PNG or WebP.',
  'Das Foto konnte nicht gelesen werden. Bitte ein anderes Foto wählen.':'The photo could not be read. Choose another photo.',
  'Kamera':'Camera','Manuelle Eingabe':'Manual input','Foto oder PDF':'Photo or PDF',
  'Text aus Kamerabild lesen':'Read text from camera image','Seriennummern aus Text, Barcode oder QR-Code erkennen.':'Recognize serial numbers from text, barcodes or QR codes.',
  'Foto mit Seriennummern oder Barcodes':'Photo with serial numbers or barcodes',
  'Barcodes werden gelesen: {0} %':'Reading barcodes: {0}%',
  'Fotos und PDFs werden lokal gelesen. Die Datei wird nicht hochgeladen.':'Photos and PDFs are read locally. The file is not uploaded.',
  'Foto oder PDF bis 20 MB. Erkannte Texte vor der Übernahme prüfen.':'Photo or PDF up to 20 MB. Check recognized text before using it.',
  'Erkennung abbrechen':'Cancel recognition','Erkennung abgebrochen. Du kannst die Datei erneut wählen.':'Recognition cancelled. You can choose the file again.',
  'Text wird erkannt …':'Recognizing text …','Texterkennung: {0} %':'Text recognition: {0}%',
  'PDF-Seite {0} von {1} wird gelesen …':'Reading PDF page {0} of {1} …',
  'Text erkannt · bitte prüfen':'Recognized text · please check','Erkannten Code prüfen und auswählen.':'Check and select the recognized code.',
  'Keine Seriennummer erkannt. Wähle ein schärferes Foto oder gib sie ein.':'No serial number found. Choose a clearer photo or enter it.',
  'Texterkennung nicht verfügbar. Barcode-Ergebnisse kannst du weiterhin verwenden.':'Text recognition unavailable. You can still use barcode results.',
  'Die Kamera ist noch nicht bereit. Bitte kurz warten.':'The camera is not ready yet. Please wait a moment.',
  'Code scannen':'Scan code','Barcode oder QR-Code':'Barcode or QR code',
  'Scanne eine EAN, Seriennummer oder Retourennummer.':'Scan an EAN, serial number or return number.',
  'Kamera starten':'Start camera','Kamera stoppen':'Stop camera','Kameravorschau':'Camera preview',
  'Halte den Code ruhig und vollständig in die Kamera.':'Hold the entire code steady in front of the camera.',
  'Die Kamera startet erst, wenn du „Kamera starten“ auswählst.':'The camera starts when you choose “Start camera”.',
  'Kamera wird gestartet …':'Starting camera …','Kamera läuft. Code in den Rahmen halten.':'Camera active. Hold the code in the frame.',
  'Kamera gestoppt. Du kannst ein Foto wählen oder den Code eingeben.':'Camera stopped. Choose a photo or enter the code.',
  'Kamera nicht freigegeben. Erlaube den Kamerazugriff oder verwende ein Foto bzw. die Eingabe.':'Camera access denied. Allow camera access, choose a photo or enter the code.',
  'Keine Kamera verfügbar. Verwende ein Foto oder die Eingabe.':'No camera available. Choose a photo or enter the code.',
  'Die Kamera ist gerade belegt. Schließe andere Kamera-Anwendungen oder verwende ein Foto.':'The camera is in use. Close other camera apps or choose a photo.',
  'Für die Kamera ist HTTPS erforderlich. Verwende ein Foto oder die Eingabe.':'The camera requires HTTPS. Choose a photo or enter the code.',
  'Die Kamera konnte nicht gestartet werden. Verwende ein Foto oder die Eingabe.':'The camera could not start. Choose a photo or enter the code.',
  'Foto auswählen':'Choose photo','Foto mit Barcode oder QR-Code':'Photo with barcode or QR code',
  'Ein gut beleuchtetes, scharfes Foto hilft bei der Erkennung.':'A well-lit, sharp photo helps recognition.',
  'Foto wird gelesen …':'Reading photo …','Kein Code erkannt. Wähle ein schärferes Foto oder gib den Code ein.':'No code found. Choose a clearer photo or enter the code.',
  'Bitte ein Foto bis 20 MB auswählen.':'Choose a photo up to 20 MB.',
  'Foto oder PDF auswählen':'Choose a photo or PDF','PDF auswählen':'Choose PDF',
  'PDF mit Seriennummern oder Barcodes':'PDF with serial numbers or barcodes',
  'PDF-Text und Barcodes werden lokal gelesen. Die Datei wird nicht hochgeladen.':'PDF text and barcodes are read locally. The file is not uploaded.',
  'Foto oder PDF bis 20 MB. Gedruckter oder handschriftlicher Bildtext wird nicht gelesen.':'Photo or PDF up to 20 MB. Printed or handwritten image text is not read.',
  'PDF wird gelesen …':'Reading PDF …','PDF-Lesen abbrechen':'Cancel PDF reading',
  'PDF-Lesen abgebrochen. Du kannst eine andere Datei wählen.':'PDF reading cancelled. You can choose another file.',
  'Bitte eine PDF-Datei bis 20 MB auswählen.':'Choose a PDF file up to 20 MB.',
  'Die PDF ist passwortgeschützt. Bitte eine ungeschützte Kopie auswählen.':'The PDF is password protected. Choose an unprotected copy.',
  'Die PDF konnte nicht gelesen werden. Sie ist möglicherweise beschädigt.':'The PDF could not be read. It may be damaged.',
  'PDF-Erkennung nicht verfügbar. Bitte erneut versuchen oder den Code eingeben.':'PDF recognition is unavailable. Try again or enter the code.',
  'Keine mögliche Seriennummer im PDF-Text gefunden. Gib den Code ein oder verwende ein Foto mit Barcode.':'No possible serial number found in the PDF text. Enter the code or use a photo with a barcode.',
  'Kein Barcode im PDF erkannt. Gedruckter oder handschriftlicher Bildtext wird nicht gelesen.':'No barcode found in the PDF. Printed or handwritten image text is not read.',
  'Gefundene Codes:':'Codes found:','Erkannte Codes zur Auswahl':'Detected codes to choose from',
  'Wähle einen passenden Code. Nur deine Auswahl wird übernommen.':'Choose the correct code. Only your selection will be used.',
  'Nur die ersten 20 Seiten wurden gelesen.':'Only the first 20 pages were read.',
  'Es werden höchstens 500 Codes angezeigt.':'Up to 500 codes are displayed.',
  'Beschriftete Seriennummer':'Labelled serial number','Mögliche Seriennummer':'Possible serial number','Seite':'Page',
  'Code eingeben oder USB-Scanner verwenden':'Enter code or use a USB scanner',
  'Code':'Code','Code übernehmen':'Use code',
  'Ein USB-Scanner kann den Code in dieses Feld schreiben. Enter übernimmt ihn.':'A USB scanner can type into this field. Press Enter to use the code.',
  'Bitte einen Code mit 1 bis 500 Zeichen ohne Zeilenumbrüche eingeben.':'Enter a code with 1–500 characters and no line breaks.',
  'Der Code konnte nicht übernommen werden.':'The code could not be used.',
  'Retourenetikett':'Return label','Etikett drucken':'Print label','Druckvorschau':'Print preview',
  'Retourennummer':'Return number','Seriennummer':'Serial number','Produkt':'Product','Kundenreferenz':'Customer reference',
  'Produkt auf dem Etikett anzeigen':'Show product on label','Kundenreferenz auf dem Etikett anzeigen':'Show customer reference on label',
  'QR-Code mit Retourennummer':'QR code with return number',
  'QR-Code enthält ausschließlich die Retourennummer.':'The QR code contains only the return number.',
  'Etikett wird geladen …':'Loading label …','Etikett konnte nicht geladen werden.':'The label could not be loaded.',
  'Bitte das Vorschaufenster im Browser erlauben und erneut versuchen.':'Allow the preview window in your browser and try again.',
  'Bitte zuerst eine gespeicherte Retoure auswählen.':'Choose a saved return first.',
  'Du hast keine Berechtigung für diese Aktion.':'You do not have permission for this action.',
});

/** Never interpret scanned text as a URL, HTML, a record ID or an instruction. */
export function normalizeScannedValue(value:unknown):string|null {
  if(typeof value!=='string')return null;
  const text=value.trim();return text.length>0&&text.length<=500&&!/[\u0000-\u001f\u007f]/.test(text)?text:null;
}
export function createBarcodeReader(cameraAspect?:()=>number){
  const reader=new BrowserMultiFormatReader(new Map([[DecodeHintType.TRY_HARDER,true]]),{delayBetweenScanAttempts:250,delayBetweenScanSuccess:200});
  if(cameraAspect)reader.decodeFromCanvas=canvas=>{
    const result=decodeBarcodeFrame(canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height),{aspectRatio:cameraAspect()});
    if(!result)throw new NotFoundException();return result;
  };
  return reader;
}

function scanCanvas(source:CanvasImageSource,width:number,height:number,region?:{left:number;top:number;width:number;height:number}){
  const crop=region??{left:0,top:0,width,height};
  if(!Number.isFinite(crop.width)||!Number.isFinite(crop.height)||crop.width<=0||crop.height<=0)throw new Error('Bild ist nicht lesbar.');
  const size=scanCanvasSize(crop.width,crop.height),canvas=document.createElement('canvas');
  canvas.width=size.width;canvas.height=size.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,crop.left,crop.top,crop.width,crop.height,0,0,canvas.width,canvas.height);return canvas;
}

type ScanSessionOptions={reader:any;video:any;mediaDevices:any;onValue:(value:string)=>void;onError:(error:any)=>void;isCurrent?:()=>boolean};
/** Own acquired tracks even while browser permission or video playback is pending. */
export function createScanSession({reader,video,mediaDevices,onValue,onError,isCurrent=()=>true}:ScanSessionOptions){
  let generation=0,active=false,stream:any=null,controls:any=null,scanVideo:any=null,lastValue='',readings=0;
  function stop(){
    generation++;active=false;lastValue='';readings=0;
    try{controls?.stop();}catch{}controls=null;
    try{stream?.getTracks().forEach(track=>track.stop());}catch{}stream=null;
    try{if(scanVideo&&scanVideo!==video){scanVideo.pause();scanVideo.srcObject=null;}}catch{}scanVideo=null;
    try{video.pause();video.srcObject=null;}catch{}
  }
  async function start(){
    if(active)return;
    stop();active=true;const attempt=generation;
    const current=()=>active&&attempt===generation&&isCurrent();
    try{
      const acquired=await mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
      if(!current()){acquired.getTracks().forEach(track=>track.stop());return;}
      stream=acquired;
      // ZXing cleans its supplied video when late controls are stopped. Each
      // attempt owns that element so it cannot clear a replacement preview.
      const target=video.cloneNode?video.cloneNode(false):video;scanVideo=target;
      if(target!==video){target.muted=true;target.autoplay=true;target.playsInline=true;video.srcObject=acquired;await video.play?.();if(!current()){acquired.getTracks().forEach(track=>track.stop());return;}}
      const scanning=await reader.decodeFromStream(acquired,target,(result:any,_error:any,callbackControls:any)=>{
        if(!current())return;
        const value=result?normalizeScannedValue(result.getText()):null;if(!value){lastValue='';readings=0;return;}
        readings=value===lastValue?readings+1:1;lastValue=value;if(readings<2)return;
        controls=callbackControls??controls;stop();onValue(value);
      });
      if(current())controls=scanning;else scanning?.stop();
    }catch(error){if(current()){stop();onError(error);}}
  }
  return {start,stop};
}

let activeScanner:(()=>void)|null=null;
/** Call from navigation and authentication reset hooks. */
export function stopScanner(){activeScanner?.();stopReturnLabel();}
function cameraError(error:any){
  if(error?.name==='NotAllowedError'||error?.name==='SecurityError')return 'Kamera nicht freigegeben. Erlaube den Kamerazugriff oder verwende ein Foto bzw. die Eingabe.';
  if(error?.name==='NotFoundError'||error?.name==='DevicesNotFoundError')return 'Keine Kamera verfügbar. Verwende ein Foto oder die Eingabe.';
  if(error?.name==='NotReadableError'||error?.name==='TrackStartError')return 'Die Kamera ist gerade belegt. Schließe andere Kamera-Anwendungen oder verwende ein Foto.';
  return 'Die Kamera konnte nicht gestartet werden. Verwende ein Foto oder die Eingabe.';
}

/** A separate dialog preserves a saved/unsaved record form underneath. */
export function openScanner(ctx:any,{onScan,onValues}:{onScan:(value:string)=>any;onValues?:(values:string[])=>any}){
  stopScanner();
  const authCurrent=captureAuthContext(ctx),dialog=document.createElement('dialog');
  const multiple=typeof onValues==='function',selection=createScanCandidateSelection();
  dialog.className='scan-code-dialog';dialog.setAttribute('aria-labelledby','scan-code-title');
  dialog.innerHTML=String(html`<div class="dialog-header"><div><h2 id="scan-code-title">Code scannen</h2><p>Seriennummern aus Text, Barcode oder QR-Code erkennen.</p></div><button type="button" class="icon-btn" data-scan-close aria-label="Schließen">${icon('close')}</button></div>
    <div class="dialog-body scan-code-body"><section class="scan-camera" aria-label="Barcode oder QR-Code"><h3>Kamera</h3><div class="scan-camera-preview"><video data-scan-video autoplay muted playsinline aria-label="Kameravorschau"></video><span class="scan-camera-frame" aria-hidden="true"></span><p data-scan-camera-idle>Halte den Code ruhig und vollständig in die Kamera.</p></div><div class="scan-camera-buttons"><button type="button" class="btn primary" data-scan-start>Kamera starten</button><button type="button" class="btn" data-scan-capture hidden>Text aus Kamerabild lesen</button><button type="button" class="btn" data-scan-stop hidden>Kamera stoppen</button></div><p class="scan-code-status" data-scan-status role="status" aria-live="polite" aria-atomic="true">Die Kamera startet erst, wenn du „Kamera starten“ auswählst.</p></section>
    <section class="scan-files" aria-labelledby="scan-code-files-title"><h3 id="scan-code-files-title">Foto oder PDF</h3><div class="scan-file-buttons"><button type="button" class="btn secondary" data-scan-photo-pick>${icon('upload')} Foto auswählen</button><button type="button" class="btn secondary" data-scan-pdf-pick>${icon('upload')} PDF auswählen</button></div><input id="scan-code-photo" data-scan-photo type="file" accept="image/*" aria-label="Foto mit Seriennummern oder Barcodes" hidden><input id="scan-code-pdf" data-scan-pdf type="file" accept="application/pdf,.pdf" aria-label="PDF mit Seriennummern oder Barcodes" hidden><p>Foto oder PDF bis 20 MB. Erkannte Texte vor der Übernahme prüfen.</p><p class="scan-file-name" data-scan-pdf-name hidden></p><div class="scan-pdf-progress"><p class="scan-code-status" data-scan-pdf-status role="status" aria-live="polite" aria-atomic="true"></p><button type="button" class="btn secondary" data-scan-pdf-cancel hidden>Erkennung abbrechen</button></div></section><section class="scan-pdf-results" data-scan-pdf-results hidden><h3 data-scan-pdf-count></h3><p data-scan-pdf-info></p><div class="scan-pdf-list" data-scan-pdf-list role="group" aria-label="Erkannte Codes zur Auswahl"></div>${multiple?html`<div class="scan-batch-controls"><p data-scan-selected-count role="status" aria-live="polite"></p><button type="button" class="btn primary" data-scan-values-use disabled>Gewählte Codes übernehmen</button></div>`:''}</section>
    <section class="scan-original" data-scan-original hidden><h3>Originalvorschau</h3><div class="scan-original-stage" data-scan-original-stage><canvas data-scan-original-canvas role="img" aria-label="Original zum Prüfen der Erkennung"></canvas><div class="scan-crop-frame" data-scan-crop-frame hidden></div><div class="scan-original-marks" data-scan-original-marks aria-hidden="true"></div></div><p class="scan-code-status" data-scan-original-status role="status" aria-live="polite"></p><div class="scan-original-page" data-scan-original-page hidden><label for="scan-original-page">PDF-Seite für die Vorschau</label><input id="scan-original-page" data-scan-page-number type="number" min="1" step="1" value="1"><span data-scan-page-total></span></div><fieldset class="scan-crop-controls" data-scan-crop-controls><legend>Ausschnitt</legend><p>Bereich im Foto ziehen oder die Prozentwerte ändern. Danach den Ausschnitt lesen.</p><div class="scan-crop-fields"><label>Links (%)<input data-scan-crop="left" type="number" min="0" max="99" step="1" value="0"></label><label>Oben (%)<input data-scan-crop="top" type="number" min="0" max="99" step="1" value="0"></label><label>Breite (%)<input data-scan-crop="width" type="number" min="1" max="100" step="1" value="100"></label><label>Höhe (%)<input data-scan-crop="height" type="number" min="1" max="100" step="1" value="100"></label></div><div class="scan-file-buttons"><button type="button" class="btn secondary" data-scan-crop-reset>Ganzes Foto</button><button type="button" class="btn primary" data-scan-crop-read>Ausschnitt lesen</button></div></fieldset></section>
    <section class="scan-manual"><h3>Manuelle Eingabe</h3><label for="scan-code-value">Code</label><div class="scan-manual-control"><input id="scan-code-value" data-scan-value type="text" maxlength="500" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="scan-code-manual-hint"><button type="button" class="btn primary" data-scan-use>Code übernehmen</button></div><p id="scan-code-manual-hint">Ein USB-Scanner kann den Code in dieses Feld schreiben. Enter übernimmt ihn.</p></section></div>`);
  document.body.append(dialog);dialog.showModal();
  const video=dialog.querySelector('[data-scan-video]') as HTMLVideoElement,manual=dialog.querySelector('[data-scan-value]') as HTMLInputElement;
  const status=dialog.querySelector('[data-scan-status]'),start=dialog.querySelector('[data-scan-start]') as HTMLButtonElement,stop=dialog.querySelector('[data-scan-stop]') as HTMLButtonElement,idle=dialog.querySelector('[data-scan-camera-idle]') as HTMLElement;
  const pdfInput=dialog.querySelector('[data-scan-pdf]') as HTMLInputElement,pdfStatus=dialog.querySelector('[data-scan-pdf-status]'),pdfResults=dialog.querySelector('[data-scan-pdf-results]') as HTMLElement,pdfList=dialog.querySelector('[data-scan-pdf-list]') as HTMLElement,pdfCancel=dialog.querySelector('[data-scan-pdf-cancel]') as HTMLButtonElement,pdfName=dialog.querySelector('[data-scan-pdf-name]') as HTMLElement;
  const capture=dialog.querySelector('[data-scan-capture]') as HTMLButtonElement;
  const batchUse=dialog.querySelector('[data-scan-values-use]') as HTMLButtonElement;
  const original=dialog.querySelector('[data-scan-original]') as HTMLElement,originalCanvas=dialog.querySelector('[data-scan-original-canvas]') as HTMLCanvasElement,originalStage=dialog.querySelector('[data-scan-original-stage]') as HTMLElement,originalMarks=dialog.querySelector('[data-scan-original-marks]') as HTMLElement,originalStatus=dialog.querySelector('[data-scan-original-status]'),cropControls=dialog.querySelector('[data-scan-crop-controls]') as HTMLElement,cropFrame=dialog.querySelector('[data-scan-crop-frame]') as HTMLElement;
  const pageControls=dialog.querySelector('[data-scan-original-page]') as HTMLElement,pageNumber=dialog.querySelector('[data-scan-page-number]') as HTMLInputElement,cropRead=dialog.querySelector('[data-scan-crop-read]') as HTMLButtonElement;
  let previewSource:CanvasImageSource|null=null,sourceWidth=0,sourceHeight=0,previewFile:File|null=null,photoFile:File|null=null,previewGeneration=0,previewPage=1,previewViewport:any=null,inspected:PdfSerialCandidate|null=null,crop:ScanBounds={left:0,top:0,width:1,height:1};
  const reader=createBarcodeReader(()=>video.clientWidth/video.clientHeight||16/9);let closed=false,photoGeneration=0,pdfGeneration=0,pdfCandidates:PdfSerialCandidate[]=[];
  const current=()=>!closed&&dialog.open&&authCurrent();
  const photoSession=createScanPhotoSession({isCurrent:current});
  const ocrSession=createSerialOcrSession({isCurrent:current,includeBounds:true,onProgress:progress=>{if(current())setText(pdfStatus,t`Texterkennung: ${Math.round(progress*100)} %`);}});
  const pdfSession=createPdfSerialSession({isCurrent:current,includeBounds:true,decodeBarcode:canvas=>{const attempt=pdfGeneration;return decodeBarcodeImage(canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height),{isCurrent:()=>current()&&attempt===pdfGeneration});},recognizeText:canvas=>ocrSession.read(canvas),onProgress:(page,total)=>{if(current())setText(pdfStatus,t`PDF-Seite ${page} von ${total} wird gelesen …`);}});
  const previewSession=createPdfPreviewSession({isCurrent:current,onPreview:(canvas,page,total,viewport)=>{
    if(!current()||!originalCanvas)return;originalCanvas.width=canvas.width;originalCanvas.height=canvas.height;originalCanvas.getContext('2d').drawImage(canvas,0,0);previewPage=page;previewViewport=viewport;
    original.hidden=false;originalStage.classList.remove('scan-photo-original');cropControls.hidden=true;pageControls.hidden=false;pageNumber.value=String(page);pageNumber.max=String(total);setText(dialog.querySelector('[data-scan-page-total]'),t`Seite ${page} / ${total}`);highlight();
  }});
  function clearPreview(){
    previewGeneration++;previewSession.stop();photoSession.stop();previewFile=null;photoFile=null;
    if(previewSource&&'getContext' in previewSource){(previewSource as HTMLCanvasElement).width=0;(previewSource as HTMLCanvasElement).height=0;}else if(previewSource&&'src' in previewSource)(previewSource as HTMLImageElement).src='';
    previewSource=null;sourceWidth=sourceHeight=0;previewViewport=null;inspected=null;
    if(original)original.hidden=true;if(originalCanvas){originalCanvas.width=0;originalCanvas.height=0;}if(originalMarks)originalMarks.innerHTML='';
  }
  function position(element:HTMLElement,bounds:ScanBounds){element.style.left=`${bounds.left*100}%`;element.style.top=`${bounds.top*100}%`;element.style.width=`${bounds.width*100}%`;element.style.height=`${bounds.height*100}%`;}
  function setCrop(region:ScanBounds){
    const next=normalizeScanRegion(region);if(next)crop=next;
    dialog.querySelectorAll<HTMLInputElement>('[data-scan-crop]').forEach(input=>input.value=String(Math.round(crop[input.dataset.scanCrop]*10000)/100));
    if(cropFrame){position(cropFrame,crop);cropFrame.hidden=!previewSource||(crop.left===0&&crop.top===0&&crop.width===1&&crop.height===1);}
  }
  function highlight(){
    if(!originalMarks)return;originalMarks.innerHTML='';
    const bounds=(inspected?.locations??[]).filter(location=>!previewFile||location.pageNumber===previewPage).map(location=>{
      if(!location.pdf)return location.bounds;if(!previewViewport?.convertToViewportRectangle)return null;
      const box=location.bounds,rectangle=previewViewport.convertToViewportRectangle([box.left,box.top,box.left+box.width,box.top+box.height]);
      return normalizeScanRegion({left:Math.min(rectangle[0],rectangle[2])/originalCanvas.width,top:Math.min(rectangle[1],rectangle[3])/originalCanvas.height,width:Math.abs(rectangle[2]-rectangle[0])/originalCanvas.width,height:Math.abs(rectangle[3]-rectangle[1])/originalCanvas.height});
    }).filter((bounds):bounds is ScanBounds=>!!bounds);
    for(const bound of bounds){const mark=document.createElement('span');mark.className='scan-original-mark';position(mark,bound);originalMarks.append(mark);}
    setText(originalStatus,inspected?t`${inspected.value} · ${t(bounds.length?'Fundstelle markiert. Erkannten Text mit dem Original vergleichen.':'Keine eindeutige Fundstelle verfügbar. Code im Original prüfen.')}`:'');
  }
  function showPhoto(source:CanvasImageSource,width:number,height:number,region:ScanBounds={left:0,top:0,width:1,height:1}){
    previewSource=source;sourceWidth=width;sourceHeight=height;previewFile=null;previewViewport=null;
    if(!originalCanvas)return;
    const size=scanCanvasSize(width,height);originalCanvas.width=size.width;originalCanvas.height=size.height;originalCanvas.getContext('2d').drawImage(source,0,0,size.width,size.height);
    original.hidden=false;originalStage.classList.add('scan-photo-original');cropControls.hidden=false;pageControls.hidden=true;setCrop(region);highlight();
  }
  async function showPdfPage(number:number){
    if(!previewFile||!current()||!originalCanvas)return;const file=previewFile,attempt=++previewGeneration;original.hidden=false;originalStage.classList.remove('scan-photo-original');cropControls.hidden=true;pageControls.hidden=false;if(cropFrame)cropFrame.hidden=true;originalMarks.innerHTML='';setText(originalStatus,t('Vorschau wird geladen …'));
    try{await previewSession.read(file,number);}catch{if(current()&&attempt===previewGeneration)setText(originalStatus,t('Die Originalvorschau konnte nicht geladen werden.'));}
  }
  async function inspect(candidate:PdfSerialCandidate){
    inspected=candidate;
    if(previewFile&&candidate.pages.length&&previewPage!==candidate.pages[0])await showPdfPage(candidate.pages[0]);else highlight();
    original?.scrollIntoView?.({block:'nearest'});
  }
  function statusText(message:string){if(current())setText(status,t(message));}
  function cameraOff(){session.stop();start.disabled=false;start.hidden=false;stop.hidden=true;if(capture)capture.hidden=true;idle.hidden=false;dialog.classList.remove('scan-camera-active');setText(status,'');}
  function stopPhoto(){photoSession.stop();}
  function photoError(error:any){return error?.code==='file'?'Bitte ein Foto bis 20 MB auswählen.':error?.code==='dimensions'?'Das Foto hat mehr als 64 Megapixel oder zu große Bildmaße. Bitte verkleinere es und wähle es erneut.':error?.code==='header'?'Die Bildmaße konnten nicht sicher geprüft werden. Bitte exportiere das Foto erneut als JPEG, PNG oder WebP.':'Das Foto konnte nicht gelesen werden. Bitte ein anderes Foto wählen.';}
  function updateSelection(){const count=selection.values().length;if(batchUse)batchUse.disabled=count===0;setText(dialog.querySelector('[data-scan-selected-count]'),t`Ausgewählte Codes: ${count}`);}
  function clearPdf(){pdfCandidates=[];selection.clear();updateSelection();inspected=null;highlight();if(pdfResults)pdfResults.hidden=true;if(pdfList)pdfList.innerHTML='';}
  function stopPdf(){pdfGeneration++;photoGeneration++;pdfSession.stop();photoSession.stop();ocrSession.stop();clearPdf();if(pdfInput)pdfInput.value='';const photo=dialog.querySelector('[data-scan-photo]') as HTMLInputElement;if(photo)photo.value='';if(pdfCancel)pdfCancel.hidden=true;}
  function showCandidates(candidates:PdfSerialCandidate[],information=''){
    const unique=new Map<string,PdfSerialCandidate>();for(const candidate of candidates){const old=unique.get(candidate.value);if(!old)unique.set(candidate.value,candidate);else{if(candidate.locations?.length)old.locations=[...(old.locations??[]),...candidate.locations];if(old.confidence===undefined&&candidate.confidence!==undefined)old.confidence=candidate.confidence;}}pdfCandidates=[...unique.values()];
    selection.replace(pdfCandidates);updateSelection();
    setText(dialog.querySelector('[data-scan-pdf-count]'),t`Gefundene Codes: ${pdfCandidates.length}`);setText(dialog.querySelector('[data-scan-pdf-info]'),t`${t(multiple?'Prüfe die Codes und markiere die Werte, die du übernehmen möchtest.':'Wähle einen passenden Code. Nur deine Auswahl wird übernommen.')} ${information}`);
    if(pdfList)pdfList.innerHTML=pdfCandidates.map((candidate,index)=>String(html`<div class="scan-candidate-row${multiple?' scan-multiple':''}">${multiple?html`<label class="scan-candidate-choice"><input type="checkbox" data-scan-choice="${index}" aria-label="Code auswählen: ${h(candidate.value)}"></label>`:''}<button type="button" class="scan-pdf-candidate" data-scan-pdf-candidate="${index}"><strong>${h(candidate.value)}</strong><span>${h(t(candidate.source==='ocr'?'Text erkannt · bitte prüfen':candidate.source==='label'?'Beschriftete Seriennummer':candidate.source==='barcode'?'Barcode oder QR-Code':'Mögliche Seriennummer'))}${candidate.pages.length?' · '+h(t`Seite ${candidate.pages.join(', ')}`):''}${candidate.confidence!==undefined?' · '+h(t`OCR-Sicherheit: ${Math.round(candidate.confidence)} % · bitte prüfen`):''}</span></button>${previewSource||previewFile?html`<button type="button" class="btn secondary scan-inspect" data-scan-inspect="${index}" aria-label="${h(t('Im Original prüfen')+': '+candidate.value)}">Im Original prüfen</button>`:''}</div>`)).join('');
    if(pdfResults){pdfResults.hidden=!pdfCandidates.length;if(pdfCandidates.length)pdfResults.scrollIntoView?.({block:'nearest'});}
  }
  async function analyseImage(canvas:HTMLCanvasElement,attempt:number,region:ScanBounds={left:0,top:0,width:1,height:1}){
    const valid=()=>current()&&attempt===photoGeneration;let candidates:PdfSerialCandidate[]=[];
    if(pdfCancel)pdfCancel.hidden=false;
    try{
      const codes=await decodeBarcodeImage(canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height),{isCurrent:valid,onProgress:(done,total)=>{if(valid())setText(pdfStatus,t`Barcodes werden gelesen: ${Math.floor(done/total*10)*10} %`);}});if(!valid())return;
      candidates=codes.map(value=>({value,pages:[],source:'barcode'}));setText(pdfStatus,t('Text wird erkannt …'));
      let warning='';try{const text=await ocrSession.read(canvas);if(!valid())return;candidates.push(...(text??[]).map(row=>({value:row.value,confidence:row.confidence,pages:[],source:'ocr' as const,locations:(row.bounds??[]).map(bounds=>mapScanBounds(bounds,canvas.width,canvas.height,region)).filter((bounds):bounds is ScanBounds=>!!bounds).map(bounds=>({pageNumber:1,bounds}))})));}catch{warning=t('Texterkennung nicht verfügbar. Barcode-Ergebnisse kannst du weiterhin verwenden.');}
      if(!valid())return;showCandidates(candidates);inspected=pdfCandidates[0]??null;highlight();setText(pdfStatus,warning||(candidates.length?'':t('Keine Seriennummer erkannt. Wähle ein schärferes Foto oder gib sie ein.')));
    }finally{canvas.width=0;canvas.height=0;if(valid()&&pdfCancel)pdfCancel.hidden=true;}
  }
  function cleanup(){
    if(closed)return;closed=true;photoGeneration++;session.stop();clearPreview();stopPhoto();stopPdf();
    window.removeEventListener('pagehide',cleanup);window.removeEventListener('popstate',cleanup);window.removeEventListener('hashchange',cleanup);document.removeEventListener('visibilitychange',visibility);
    if(activeScanner===cleanup)activeScanner=null;
    if(dialog.open)dialog.close();dialog.remove();
  }
  function deliver(value:string){
    if(!current()){cleanup();return;}
    const valid=normalizeScannedValue(value);if(!valid){statusText('Bitte einen Code mit 1 bis 500 Zeichen ohne Zeilenumbrüche eingeben.');manual.focus();return;}
    cleanup();Promise.resolve().then(()=>{if(authCurrent())return onScan(valid);}).catch(error=>ctx.toast?.(apiError(error?.message||'Der Code konnte nicht übernommen werden.')));
  }
  if(batchUse)batchUse.onclick=()=>{
    if(!current()){cleanup();return;}if(!multiple)return;
    const values=selection.values();if(!values.length)return;
    if(values.some(value=>normalizeScannedValue(value)===null)){statusText('Bitte einen Code mit 1 bis 500 Zeichen ohne Zeilenumbrüche eingeben.');return;}
    cleanup();Promise.resolve().then(()=>{if(authCurrent())return onValues(values);}).catch(error=>ctx.toast?.(apiError(error?.message||'Die Codes konnten nicht übernommen werden.')));
  };
  const session=createScanSession({reader,video,mediaDevices:navigator.mediaDevices,onValue:value=>{cameraOff();showCandidates([{value,pages:[],source:'barcode'}]);statusText('Erkannten Code prüfen und auswählen.');},onError:error=>{cameraOff();statusText(cameraError(error));},isCurrent:current});
  function visibility(){if(document.hidden){cameraOff();statusText('Kamera gestoppt. Du kannst ein Foto wählen oder den Code eingeben.');}}
  activeScanner=cleanup;
  window.addEventListener('pagehide',cleanup);window.addEventListener('popstate',cleanup);window.addEventListener('hashchange',cleanup);document.addEventListener('visibilitychange',visibility);
  dialog.addEventListener('close',cleanup,{once:true});dialog.addEventListener('cancel',event=>{event.preventDefault();cleanup();});
  (dialog.querySelector('[data-scan-close]') as HTMLButtonElement).onclick=cleanup;
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect(),e=event as MouseEvent;if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)cleanup();});
  start.onclick=async()=>{
    if(!current()){cleanup();return;}
    if(!globalThis.isSecureContext||!navigator.mediaDevices?.getUserMedia){statusText(!globalThis.isSecureContext?'Für die Kamera ist HTTPS erforderlich. Verwende ein Foto oder die Eingabe.':'Keine Kamera verfügbar. Verwende ein Foto oder die Eingabe.');return;}
    photoGeneration++;clearPreview();stopPhoto();stopPdf();setText(pdfStatus,'');if(pdfName)pdfName.hidden=true;start.disabled=true;start.hidden=true;stop.hidden=false;if(capture)capture.hidden=false;idle.hidden=true;dialog.classList.add('scan-camera-active');statusText('Kamera wird gestartet …');
    await session.start();if(current()&&start.hidden)statusText('Kamera läuft. Code in den Rahmen halten.');
  };
  stop.onclick=()=>{cameraOff();statusText('Kamera gestoppt. Du kannst ein Foto wählen oder den Code eingeben.');};
  if(capture)capture.onclick=async()=>{
    if(!current()){cleanup();return;}const region=cameraFrameRegion(video.videoWidth,video.videoHeight,video.clientWidth/video.clientHeight||16/9);
    if(!region){statusText('Die Kamera ist noch nicht bereit. Bitte kurz warten.');return;}
    const canvas=scanCanvas(video,video.videoWidth,video.videoHeight,region),snapshot=scanCanvas(video,video.videoWidth,video.videoHeight),selection={left:region.left/video.videoWidth,top:region.top/video.videoHeight,width:region.width/video.videoWidth,height:region.height/video.videoHeight};
    cameraOff();stopPdf();clearPreview();stopPhoto();showPhoto(snapshot,snapshot.width,snapshot.height,selection);const attempt=photoGeneration;
    setText(pdfStatus,t('Text wird erkannt …'));await analyseImage(canvas,attempt,selection);
  };
  (dialog.querySelector('[data-scan-use]') as HTMLButtonElement).onclick=()=>deliver(manual.value);
  manual.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();deliver(manual.value);}});
  const photoInput=dialog.querySelector('[data-scan-photo]') as HTMLInputElement;
  const photoPick=dialog.querySelector('[data-scan-photo-pick]') as HTMLButtonElement,pdfPick=dialog.querySelector('[data-scan-pdf-pick]') as HTMLButtonElement;
  if(photoPick)photoPick.onclick=()=>{if(current())photoInput.click();};
  if(pdfPick)pdfPick.onclick=()=>{if(current())pdfInput.click();};
  if(pdfCancel)pdfCancel.onclick=()=>{stopPdf();previewGeneration++;previewSession.stop();if(current())setText(pdfStatus,t('Erkennung abgebrochen. Du kannst die Datei erneut wählen.'));};
  if(pageNumber)pageNumber.onchange=()=>{void showPdfPage(Number(pageNumber.value));};
  dialog.querySelectorAll<HTMLInputElement>('[data-scan-crop]').forEach(input=>input.onchange=()=>{
    const values={...crop,[input.dataset.scanCrop]:Number(input.value)/100};stopPdf();setText(pdfStatus,'');setCrop(values);
  });
  const cropReset=dialog.querySelector('[data-scan-crop-reset]') as HTMLButtonElement;
  if(cropReset)cropReset.onclick=()=>{stopPdf();setText(pdfStatus,'');setCrop({left:0,top:0,width:1,height:1});};
  if(cropRead)cropRead.onclick=async()=>{
    if(!current()||!previewSource)return;stopPdf();const attempt=photoGeneration,selection={...crop},file=photoFile;
    setText(pdfStatus,t('Foto wird gelesen …'));if(pdfCancel)pdfCancel.hidden=false;
    try{
      const canvas=file?await photoSession.read(file,selection):scanCanvas(previewSource,sourceWidth,sourceHeight,{left:crop.left*sourceWidth,top:crop.top*sourceHeight,width:crop.width*sourceWidth,height:crop.height*sourceHeight});
      if(!canvas)return;if(!current()||attempt!==photoGeneration){canvas.width=0;canvas.height=0;return;}await analyseImage(canvas,attempt,selection);
    }catch(error){if(current()&&attempt===photoGeneration)setText(pdfStatus,t(photoError(error)));}
    finally{if(current()&&attempt===photoGeneration&&pdfCancel)pdfCancel.hidden=true;}
  };
  if(originalStage){
    let anchor:{x:number;y:number;pointerId:number}|null=null;
    const point=(event:PointerEvent)=>{const rect=originalStage.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};};
    originalStage.addEventListener('pointerdown',event=>{if(!previewSource||!current()||event.button!==0)return;stopPdf();setText(pdfStatus,'');const p=point(event);anchor={...p,pointerId:event.pointerId};originalStage.setPointerCapture(event.pointerId);event.preventDefault();});
    originalStage.addEventListener('pointermove',event=>{if(!anchor||anchor.pointerId!==event.pointerId)return;const p=point(event);setCrop({left:Math.min(p.x,anchor.x),top:Math.min(p.y,anchor.y),width:Math.max(.01,Math.abs(p.x-anchor.x)),height:Math.max(.01,Math.abs(p.y-anchor.y))});});
    const release=(event:PointerEvent)=>{if(anchor?.pointerId!==event.pointerId)return;anchor=null;try{originalStage.releasePointerCapture(event.pointerId);}catch{}};
    originalStage.addEventListener('pointerup',release);originalStage.addEventListener('pointercancel',release);
  }
  if(pdfList)pdfList.onclick=event=>{
    const inspectButton=(event.target as HTMLElement).closest('[data-scan-inspect]') as HTMLElement,inspectIndex=Number(inspectButton?.dataset.scanInspect);
    if(inspectButton&&Number.isSafeInteger(inspectIndex)&&inspectIndex>=0&&inspectIndex<pdfCandidates.length){void inspect(pdfCandidates[inspectIndex]);return;}
    const button=(event.target as HTMLElement).closest('[data-scan-pdf-candidate]') as HTMLElement,index=Number(button?.dataset.scanPdfCandidate);
    if(button&&Number.isSafeInteger(index)&&index>=0&&index<pdfCandidates.length)deliver(pdfCandidates[index].value);
  };
  if(pdfList&&multiple)pdfList.onchange=event=>{
    if(!current()){cleanup();return;}
    const input=(event.target as HTMLElement).closest('[data-scan-choice]') as HTMLInputElement;if(!input)return;
    selection.choose(Number(input.dataset.scanChoice),input.checked);updateSelection();
  };
  if(pdfInput)pdfInput.onchange=async event=>{
    const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;
    if(!current()){cleanup();return;}
    cameraOff();photoGeneration++;clearPreview();stopPhoto();stopPdf();const attempt=pdfGeneration;previewFile=file;void showPdfPage(1);
    pdfName.hidden=false;setText(pdfName,file.name);pdfCancel.hidden=false;setText(pdfStatus,t('PDF wird gelesen …'));
    try{
      const result=await pdfSession.read(file);if(!result||!current()||attempt!==pdfGeneration)return;
      pdfCandidates=result.candidates;
      const partial=result.truncated?t('Nur die ersten 20 Seiten wurden gelesen.'):t(''),limited=result.candidatesLimited?t('Es werden höchstens 500 Codes angezeigt.'):t('');
      if(!pdfCandidates.length){
        const empty=result.ocrUnavailable?'Texterkennung nicht verfügbar. Barcode-Ergebnisse kannst du weiterhin verwenden.':'Keine Seriennummer erkannt. Wähle ein schärferes Foto oder gib sie ein.';
        setText(pdfStatus,t`${t(empty)} ${partial}`);return;
      }
      setText(pdfStatus,result.ocrUnavailable?t('Texterkennung nicht verfügbar. Barcode-Ergebnisse kannst du weiterhin verwenden.'):'');showCandidates(pdfCandidates,t`${partial} ${limited}`);void inspect(pdfCandidates[0]);
    }catch(error){
      if(current()&&attempt===pdfGeneration){
        const messages={size:'Bitte eine PDF-Datei bis 20 MB auswählen.',type:'Bitte eine PDF-Datei bis 20 MB auswählen.',password:'Die PDF ist passwortgeschützt. Bitte eine ungeschützte Kopie auswählen.',unavailable:'PDF-Erkennung nicht verfügbar. Bitte erneut versuchen oder den Code eingeben.',invalid:'Die PDF konnte nicht gelesen werden. Sie ist möglicherweise beschädigt.'};
        setText(pdfStatus,t(messages[error?.code]||messages.invalid));
      }
    }finally{if(attempt===pdfGeneration){pdfCancel.hidden=true;input.value='';}}
  };
  (dialog.querySelector('[data-scan-photo]') as HTMLInputElement).onchange=async(event)=>{
    const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;
    if(!current()){cleanup();return;}
    cameraOff();stopPdf();clearPreview();setText(pdfStatus,'');if(pdfName){pdfName.hidden=false;setText(pdfName,file.name);}const attempt=++photoGeneration;
    setText(pdfStatus,t('Foto wird gelesen …'));if(pdfCancel)pdfCancel.hidden=false;
    try{
      const original=await photoSession.read(file);if(!original)return;
      if(!current()||attempt!==photoGeneration){original.width=0;original.height=0;return;}
      photoFile=file;showPhoto(original,original.width,original.height);const canvas=scanCanvas(original,original.width,original.height);await analyseImage(canvas,attempt);
    }catch(error){if(current()&&attempt===photoGeneration)setText(pdfStatus,t(photoError(error)));}
    finally{if(attempt===photoGeneration){if(pdfCancel)pdfCancel.hidden=true;input.value='';}}
  };
  const initialFocus=globalThis.matchMedia?.('(max-width:760px)').matches?dialog.querySelector<HTMLElement>('[data-scan-close]'):manual;
  initialFocus?.focus({preventScroll:true});return dialog;
}

