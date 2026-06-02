export const challengeLoginMessageQuery =
  'query challengeLoginMessageQuery(\n  $address: AddressScalar!\n) {\n  auth {\n    loginMessage(address: $address)\n  }\n}\n';

export const authLoginV2AuthSimplifiedMutation =
  'mutation authLoginV2AuthSimplifiedMutation(\n  $address: AddressScalar!\n  $message: String!\n  $deviceId: String!\n  $signature: String!\n  $chain: ChainScalar\n) {\n  AuthTypeV2 {\n    webLoginV2(address: $address, deviceId: $deviceId, message: $message, signature: $signature, chain: $chain) {\n      address\n      isEmployee\n    }\n  }\n}\n';