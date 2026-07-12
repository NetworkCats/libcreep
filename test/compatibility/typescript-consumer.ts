import libcreep, {
  collect,
  load,
  type FingerprintAgent,
  type FingerprintResult,
  type GetOptions,
} from 'libcreep';

const options: GetOptions = { includeWebRTC: false };
const agent: Promise<FingerprintAgent> = load();
const result: Promise<FingerprintResult> = collect(options);

void libcreep;
void agent;
void result;
