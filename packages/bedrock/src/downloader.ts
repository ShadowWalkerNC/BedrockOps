import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

export class BdsDownloader {
  public static readonly MOJANG_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  public static getBdsUrl(version: string, platform: 'win' | 'linux' = process.platform === 'win32' ? 'win' : 'linux'): string {
    const osSlug = platform === 'win' ? 'bin-win' : 'bin-linux';
    return `https://www.minecraft.net/bedrockdedicatedserver/${osSlug}/bedrock-server-${version}.zip`;
  }

  public static async downloadArchive(url: string, destPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const file = fs.createWriteStream(destPath);

      const options = {
        headers: {
          'User-Agent': this.MOJANG_USER_AGENT
        }
      };

      https
        .get(url, options, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            const redirectUrl = res.headers.location;
            if (!redirectUrl) return reject(new Error('Redirect location header missing'));
            return resolve(this.downloadArchive(redirectUrl, destPath));
          }

          if (res.statusCode !== 200) {
            return reject(new Error(`Failed to download BDS archive: HTTP ${res.statusCode}`));
          }

          res.pipe(file);
          file.on('finish', () => {
            file.close(() => resolve(destPath));
          });
        })
        .on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
    });
  }
}
