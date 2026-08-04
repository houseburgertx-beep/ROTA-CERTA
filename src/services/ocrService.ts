import { createWorker } from "tesseract.js";
import type { OCRResult } from "../types";
export async function readReceipt(image:File,onProgress?:(n:number)=>void):Promise<OCRResult>{
 const worker=await createWorker("por",1,{logger:m=>m.status==="recognizing text"&&onProgress?.(Math.round(m.progress*100))});
 const {data}=await worker.recognize(image); await worker.terminate(); const text=data.text;
 const phone=text.match(/(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}/)?.[0]; const postalCode=text.match(/\d{5}-?\d{3}/)?.[0]; const value=text.match(/(?:R\$\s*)?(\d+[.,]\d{2})/)?.[1];
 return {rawText:text,confidence:data.confidence,fields:{customerPhone:phone,postalCode,amount:value?Number(value.replace(",",".")):undefined,source:"ocr"},warnings:data.confidence<70?["Confira os campos destacados"]:[]};
}
