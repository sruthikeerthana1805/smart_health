import { buildSchema } from "graphql";
import { prisma } from "../lib/prisma";
import { redisClient, doctorQueueKey, pharmacyQueueKey } from "../lib/redis";

export const schema = buildSchema(`
  type InventoryItem {
    drugId: String!
    drugName: String!
    currentStock: Int!
    minBuffer: Int!
    isLowStock: Boolean!
    daysToExpiry: Int
    expiryAlert: Boolean!
  }

  type QueueStatus {
    doctorQueueLength: Int!
    pharmacyQueueLength: Int!
  }

  type BedStatus {
    totalBeds: Int!
    occupiedBeds: Int!
    availableBeds: Int!
  }

  type FacilityDashboard {
    facilityId: String!
    facilityName: String!
    inventory: [InventoryItem!]!
    queues: QueueStatus!
    beds: BedStatus!
    doctorsPresent: Int!
    doctorsTotal: Int!
  }

  type Query {
    facilityDashboard(facilityId: String!): FacilityDashboard
  }
`);

// Root resolver — aggregates Postgres (inventory, beds, staff) + Redis (live queues)
export const root = {
  facilityDashboard: async ({ facilityId }: { facilityId: string }) => {
    const facility = await prisma.facility.findUnique({ where: { id: facilityId } });
    if (!facility) return null;

    const inventory = await prisma.inventory.findMany({
      where: { facilityId },
      include: { expiryBatches: { orderBy: { expiryDate: "asc" } } },
    });
    const beds = await prisma.bed.findMany({ where: { facilityId } });
    const staff = await prisma.staff.findMany({ where: { facilityId } });

    const doctorQueueLength = await redisClient.lLen(doctorQueueKey(facilityId));
    const pharmacyQueueLength = await redisClient.lLen(pharmacyQueueKey(facilityId));

    const occupiedBeds = beds.filter((b) => b.isOccupied).length;

    return {
      facilityId: facility.id,
      facilityName: facility.name,
      inventory: inventory.map((i) => {
        const nearest = i.expiryBatches[0];
        const daysToExpiry = nearest ? Math.ceil((nearest.expiryDate.getTime() - Date.now()) / 86400000) : null;
        return {
          drugId: i.drugId,
          drugName: i.drugName,
          currentStock: i.currentStock,
          minBuffer: i.minBuffer,
          isLowStock: i.currentStock <= i.minBuffer,
          daysToExpiry,
          expiryAlert: daysToExpiry !== null && daysToExpiry <= 30,
        };
      }),
      queues: { doctorQueueLength, pharmacyQueueLength },
      beds: {
        totalBeds: beds.length,
        occupiedBeds,
        availableBeds: beds.length - occupiedBeds,
      },
      doctorsPresent: staff.filter((s) => s.isPresent).length,
      doctorsTotal: staff.length,
    };
  },
};
