import { Contract, ethers, Wallet } from "ethers";
import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";
import config from "../config";

export async function listOnMagicEden(walletAddress: string, contract: string, tokenId: string | number, listingPrice: number, wallet: ethers.Wallet) {
  const listEndpoint =
    "https://nfttools.pro/magiceden/v3/rtp/ethereum/execute/list/v5";
  const signEndpoint =
    "https://nfttools.pro/magiceden/v3/rtp/ethereum/order/v4";
  const headers = {
    "X-NFT-API-Key": config.apiKey,
  };

  const weiPrice = (listingPrice * 1e18).toString()

  const duration = 15 //mins

  const expirationTime = (
    Math.floor(Date.now() / 1000) + 60 * duration
  ).toString()

  try {

    console.log({ contract });

    await approveNFT(
      contract,
      wallet,
      '0x9A1D00bEd7CD04BCDA516d721A596eb22Aac6834'
    );


    const listResponse = await limiter.schedule(() =>
      axiosInstance.post(
        listEndpoint,
        {
          maker: walletAddress,
          source: "magiceden.io",
          params: [
            {
              token: `${contract}:${tokenId}`,
              weiPrice: weiPrice,
              orderbook: "reservoir",
              orderKind: "payment-processor-v2",
              quantity: 1,
              currency: "0x0000000000000000000000000000000000000000",
              expirationTime: expirationTime,
              automatedRoyalties: false,
              options: {
                "payment-processor-v2": { useOffChainCancellation: true },
              },
            },
          ],
        },
        { headers }
      )
    );

    const signData = listResponse.data.steps.find(
      (step: any) => step.id === "order-signature"
    ).items[0].data.sign;

    const signature = await wallet._signTypedData(
      signData.domain,
      signData.types,
      signData.value
    );

    const { seller, ...restOfSignData } = signData.value;

    const order = {
      items: [
        {
          order: {
            kind: "payment-processor-v2",
            data: {
              kind: "sale-approval",
              sellerOrBuyer: seller,
              ...restOfSignData,
              r: "0x0000000000000000000000000000000000000000000000000000000000000000",
              s: "0x0000000000000000000000000000000000000000000000000000000000000000",
              v: 0,
            },
          },
          orderbook: "reservoir",
        },
      ],
      source: "magiceden.io",
    };

    const finalListingResponse = await limiter.schedule(() =>
      axiosInstance.post(
        `${signEndpoint}?signature=${encodeURIComponent(signature)}`,
        order,
        { headers }
      )
    );
    console.log("NFT listed successfully:");
    console.log(finalListingResponse.data);
    return finalListingResponse.data;
  } catch (error: any) {
    console.error("Failed to list NFT:", error?.response?.data || error?.response || error);
    return null;
  }
}

const approveAbi = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'account',
        type: 'address'
      },
      {
        internalType: 'address',
        name: 'operator',
        type: 'address'
      }
    ],
    name: 'isApprovedForAll',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'operator',
        type: 'address'
      },
      {
        internalType: 'bool',
        name: 'approved',
        type: 'bool'
      }
    ],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

export async function approveNFT(
  nftAddress: string,
  wallet: Wallet,
  marketContractAddress: string
): Promise<void> {

  const nftContract = new Contract(nftAddress, approveAbi, wallet);

  try {
    const approved: boolean = await nftContract.isApprovedForAll(
      wallet.address,
      marketContractAddress
    );
    console.log({ approved });
    if (!approved) {
      console.log('Approve NFT to', marketContractAddress);
      const tx = await nftContract.setApprovalForAll(
        marketContractAddress,
        true
      );
      await tx.wait();
      console.log('NFT approved successfully');
    }
  } catch (err: any) {
    console.log(err?.reason ?? err?.message);
  }
};