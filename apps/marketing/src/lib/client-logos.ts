export interface ClientLogo {
	name: string;
	label: string;
	logo: string;
	height: number;
	marginTop?: number;
	borderRadius?: number;
	invert?: boolean;
}

export const CLIENT_LOGOS: ClientLogo[] = [
	{
		name: "microsoft",
		label: "Microsoft",
		logo: "/logos/microsoft-wordmark.svg",
		height: 20,
	},
	{
		name: "openai",
		label: "OpenAI",
		logo: "/logos/openai-wordmark.svg",
		height: 20,
	},
	{
		name: "runway",
		label: "Runway",
		logo: "/logos/runway-wordmark.svg",
		height: 18,
	},
	{
		name: "wordware",
		label: "Wordware",
		logo: "/logos/wordware-wordmark.svg",
		height: 16,
	},
	{
		name: "salesforce",
		label: "Salesforce",
		logo: "/logos/salesforce-wordmark-dark.svg",
		height: 50,
		invert: false,
	},
	{
		name: "wix",
		label: "Wix",
		logo: "/logos/wix-wordmark.svg",
		height: 16,
	},
	{
		name: "datadog",
		label: "Datadog",
		logo: "/logos/datadog-wordmark.svg",
		height: 42,
	},
	{
		name: "intercom",
		label: "Intercom",
		logo: "/logos/intercom-white.png",
		height: 26,
	},
	{
		name: "bytedance",
		label: "ByteDance",
		logo: "/logos/bytedance-wordmark.svg",
		height: 18,
	},
	{
		name: "toss",
		label: "Toss",
		logo: "/logos/toss-wordmark.svg",
		height: 18,
	},
	{
		name: "google",
		label: "Google",
		logo: "/logos/google.svg",
		height: 24,
	},
	{
		name: "vercel",
		label: "Vercel",
		logo: "/logos/vercel-wordmark.svg",
		height: 38,
	},
	{
		name: "cloudflare",
		label: "Cloudflare",
		logo: "/logos/cloudflare-wordmark.svg",
		height: 48,
		marginTop: -16,
	},
	{
		name: "amazon",
		label: "Amazon",
		logo: "/logos/amazon.png",
		height: 22,
	},
];
