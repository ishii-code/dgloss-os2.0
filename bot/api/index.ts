/**
 * Vercel Serverless Function エントリ。Express アプリ(app)をそのまま関数として公開する。
 * vercel.json のリライトで全パスをこの関数へ流す。
 */
import { app } from "../src/index.js";

export default app;
