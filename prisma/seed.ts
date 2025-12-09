import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  {
    name: "토지 및 시설",
    order: 1,
    subcategories: [
      {
        name: "토지",
        order: 1,
        items: ["토지매입비", "임대보증금", "취득세/등록세"],
      },
      {
        name: "시설",
        order: 2,
        items: ["비닐하우스", "유리온실", "관수시설", "전기공사", "난방시설"],
      },
      {
        name: "건축물",
        order: 3,
        items: ["창고", "작업장", "사무실", "숙소"],
      },
    ],
  },
  {
    name: "장비",
    order: 2,
    subcategories: [
      {
        name: "재배장비",
        order: 1,
        items: ["파종기", "이식기", "수확기", "선별기"],
      },
      {
        name: "스마트설비",
        order: 2,
        items: ["환경센서", "제어장치", "모니터링시스템", "자동화설비"],
      },
      {
        name: "운송장비",
        order: 3,
        items: ["경운기", "트랙터", "운반차량"],
      },
    ],
  },
  {
    name: "운영준비",
    order: 3,
    subcategories: [
      {
        name: "종자/묘목",
        order: 1,
        items: ["종자구입", "묘목구입", "초기재식비"],
      },
      {
        name: "자재",
        order: 2,
        items: ["비료", "농약", "상토", "포장재"],
      },
      {
        name: "인력",
        order: 3,
        items: ["초기인건비", "교육비용", "컨설팅비"],
      },
    ],
  },
  {
    name: "기타",
    order: 4,
    subcategories: [
      {
        name: "인허가",
        order: 1,
        items: ["농업경영체등록", "시설허가", "환경영향평가"],
      },
      {
        name: "예비비",
        order: 2,
        items: ["예비비(10~15%)"],
      },
    ],
  },
];

async function main() {
  console.log("Seeding database...");

  // Create setup cost categories
  for (const category of DEFAULT_CATEGORIES) {
    const createdCategory = await prisma.setupCostCategory.create({
      data: {
        name: category.name,
        order: category.order,
      },
    });

    for (const subcategory of category.subcategories) {
      await prisma.setupCostSubcategory.create({
        data: {
          categoryId: createdCategory.id,
          name: subcategory.name,
          order: subcategory.order,
        },
      });
    }
  }

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
