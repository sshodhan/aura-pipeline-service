import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

interface NetworkingArgs {
  name: string;
  region: string;
  dependsOn?: pulumi.Resource[];
}

export function createNetworking(args: NetworkingArgs) {
  // Create VPC Network for private connectivity
  const network = new gcp.compute.Network(
    `${args.name}-network`,
    {
      name: `${args.name}-vpc`,
      autoCreateSubnetworks: false,
      description: "VPC for AURA Pipeline services",
    },
    { dependsOn: args.dependsOn }
  );

  // Create Subnet
  const subnet = new gcp.compute.Subnetwork(
    `${args.name}-subnet`,
    {
      name: `${args.name}-subnet`,
      network: network.id,
      region: args.region,
      ipCidrRange: "10.0.0.0/24",
      privateIpGoogleAccess: true,
    },
    { dependsOn: [network] }
  );

  // Create VPC Connector for Cloud Run → Redis connectivity
  const vpcConnector = new gcp.vpcaccess.Connector(
    `${args.name}-connector`,
    {
      name: `${args.name}-connector`,
      region: args.region,
      network: network.id,
      ipCidrRange: "10.8.0.0/28", // /28 required for connectors
      minInstances: 2,
      maxInstances: 3,
      machineType: "e2-micro",
    },
    { dependsOn: [network, subnet] }
  );

  // Firewall rule: Allow internal traffic
  const firewallInternal = new gcp.compute.Firewall(
    `${args.name}-allow-internal`,
    {
      name: `${args.name}-allow-internal`,
      network: network.id,
      allows: [
        { protocol: "tcp", ports: ["0-65535"] },
        { protocol: "udp", ports: ["0-65535"] },
        { protocol: "icmp" },
      ],
      sourceRanges: ["10.0.0.0/8"],
      description: "Allow internal VPC traffic",
    },
    { dependsOn: [network] }
  );

  // Firewall rule: Allow Redis port from VPC connector
  const firewallRedis = new gcp.compute.Firewall(
    `${args.name}-allow-redis`,
    {
      name: `${args.name}-allow-redis`,
      network: network.id,
      allows: [{ protocol: "tcp", ports: ["6379"] }],
      sourceRanges: ["10.8.0.0/28"], // VPC connector range
      description: "Allow Redis connections from VPC connector",
    },
    { dependsOn: [network] }
  );

  // Reserve IP range for Private Service Connection (required for Memorystore)
  const privateIpRange = new gcp.compute.GlobalAddress(
    `${args.name}-private-ip`,
    {
      name: `${args.name}-private-ip`,
      purpose: "VPC_PEERING",
      addressType: "INTERNAL",
      prefixLength: 16,
      network: network.id,
    },
    { dependsOn: [network] }
  );

  // Private Service Connection for Memorystore
  const privateConnection = new gcp.servicenetworking.Connection(
    `${args.name}-private-connection`,
    {
      network: network.id,
      service: "servicenetworking.googleapis.com",
      reservedPeeringRanges: [privateIpRange.name],
    },
    { dependsOn: [privateIpRange] }
  );

  return {
    network,
    subnet,
    vpcConnector,
    privateConnection,
  };
}
