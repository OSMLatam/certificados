import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { AppEnv } from "../config/env";
import { parseOsmUserXml } from "./osm-identity";

const USER_AGENT = "CertificadosOSMLatam/1.0 (contact@osm.lat)";

@Injectable()
export class OsmOAuthClient {
  constructor(private readonly env: AppEnv) {}

  authorizeUrl(state: string): string {
    const url = new URL("https://www.openstreetmap.org/oauth2/authorize");
    url.searchParams.set("client_id", this.env.OSM_OAUTH_CLIENT_ID);
    url.searchParams.set("redirect_uri", this.env.OSM_OAUTH_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "read_prefs");
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.env.OSM_OAUTH_REDIRECT_URI,
      client_id: this.env.OSM_OAUTH_CLIENT_ID,
      client_secret: this.env.OSM_OAUTH_CLIENT_SECRET,
    });
    const response = await fetch("https://www.openstreetmap.org/oauth2/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "user-agent": USER_AGENT,
      },
      body,
    });
    if (!response.ok) {
      throw new UnauthorizedException("OSM token exchange failed");
    }
    const json = (await response.json()) as { access_token?: string };
    if (!json.access_token) {
      throw new UnauthorizedException("OSM token missing");
    }
    return json.access_token;
  }

  async fetchIdentity(accessToken: string): Promise<{ osmId: string; displayName: string }> {
    const response = await fetch("https://api.openstreetmap.org/api/0.6/user/details", {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/xml",
        "user-agent": USER_AGENT,
      },
    });
    if (!response.ok) {
      throw new UnauthorizedException("OSM identity lookup failed");
    }
    return parseOsmUserXml(await response.text());
  }
}
