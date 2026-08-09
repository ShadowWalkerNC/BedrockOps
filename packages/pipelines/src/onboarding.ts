import {
  AllowlistEntry,
  AllowlistService,
  XboxIdentityService,
  FriendInviteRecord,
  GamertagResolution
} from '@mc-admin/moderation';

export interface ConsoleOnboardingResult {
  gamertag: string;
  xuid: string;
  resolution: GamertagResolution;
  invite: FriendInviteRecord;
  allowlistEntry: AllowlistEntry;
  allowlistPlan?: ReturnType<typeof AllowlistService.prepareSync>;
  stub: boolean;
}

/**
 * R5.2 — Console player onboarding:
 * resolve Gamertag → XUID, dispatch Friend Bot invite, seed allowlist entry.
 */
export class ConsoleOnboardingService {
  constructor(private readonly xbox: XboxIdentityService = XboxIdentityService.fromEnv()) {}

  public async onboard(input: {
    gamertag: string;
    serverId: string;
    serverPath?: string;
    ignoresPlayerLimit?: boolean;
    autoAcceptInvite?: boolean;
  }): Promise<ConsoleOnboardingResult> {
    const resolution = await this.xbox.resolveGamertag(input.gamertag);
    const invite = await this.xbox.dispatchFriendInvite(input.gamertag);

    if (input.autoAcceptInvite && invite.status === 'PENDING') {
      this.xbox.acceptFriendInvite(invite.id);
    }

    const allowlistEntry: AllowlistEntry = {
      name: resolution.gamertag || input.gamertag,
      xuid: resolution.xuid,
      ignoresPlayerLimit: input.ignoresPlayerLimit ?? true
    };

    const allowlistPlan = input.serverPath
      ? AllowlistService.prepareSync(input.serverId, input.serverPath, [allowlistEntry])
      : undefined;

    return {
      gamertag: allowlistEntry.name,
      xuid: allowlistEntry.xuid,
      resolution,
      invite: this.xbox.getInviteHistory({ gamertag: allowlistEntry.name })[0] ?? invite,
      allowlistEntry,
      allowlistPlan,
      stub: resolution.stub || invite.stub
    };
  }
}
