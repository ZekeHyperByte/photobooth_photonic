import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';

interface SessionInfo {
  folder: string;
  files: Array<{
    filename: string;
    timestamp: number;
  }>;
}

export class DigiCamControlClient {
  private client: AxiosInstance;
  private baseURL: string;

  constructor(host: string = env.digiCamControl.host, port: number = env.digiCamControl.port) {
    this.baseURL = `http://${host}:${port}`;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: env.digiCamControl.timeoutMs,
      validateStatus: (status) => status < 500,
    });
  }

  async ping(): Promise<boolean> {
    try {
      const response = await this.client.get('/');
      return response.status === 200;
    } catch (error) {
      console.error('DigiCamControl ping failed:', error);
      return false;
    }
  }

  async capture(): Promise<void> {
    try {
      const response = await this.client.get('/', {
        params: { slc: 'capture' },
      });

      if (response.status !== 200) {
        throw new Error(`Capture failed with status ${response.status}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`DigiCamControl capture failed: ${error.message}`);
      }
      throw error;
    }
  }

  async setSessionFolder(folderPath: string): Promise<void> {
    try {
      const response = await this.client.get('/', {
        params: {
          slc: 'set',
          param1: 'session.folder',
          param2: folderPath,
        },
      });

      if (response.status !== 200) {
        throw new Error(`Set session folder failed with status ${response.status}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`DigiCamControl set session folder failed: ${error.message}`);
      }
      throw error;
    }
  }

  async setFilenameTemplate(template: string): Promise<void> {
    try {
      const response = await this.client.get('/', {
        params: {
          slc: 'set',
          param1: 'session.filenametemplate',
          param2: template,
        },
      });

      if (response.status !== 200) {
        throw new Error(`Set filename template failed with status ${response.status}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`DigiCamControl set filename template failed: ${error.message}`);
      }
      throw error;
    }
  }

  async getSession(): Promise<SessionInfo> {
    try {
      const response = await this.client.get('/session.json');

      if (response.status !== 200) {
        throw new Error(`Get session failed with status ${response.status}`);
      }

      return response.data as SessionInfo;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`DigiCamControl get session failed: ${error.message}`);
      }
      throw error;
    }
  }

  async downloadImage(filename: string): Promise<Buffer> {
    try {
      const response = await this.client.get(`/image/${filename}.jpg`, {
        responseType: 'arraybuffer',
      });

      if (response.status !== 200) {
        throw new Error(`Download image failed with status ${response.status}`);
      }

      return Buffer.from(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`DigiCamControl download image failed: ${error.message}`);
      }
      throw error;
    }
  }

  async checkImageAvailable(filename: string): Promise<boolean> {
    try {
      const response = await this.client.head(`/image/${filename}.jpg`);
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  getLiveViewStreamURL(): string {
    return `${this.baseURL}/liveview.mjpg`;
  }
}
