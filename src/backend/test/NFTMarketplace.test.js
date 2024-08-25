const { expect } = require("chai");
const hre = require("hardhat");
const toWei = (num) => hre.ethers.utils.parseEther(num.toString());
const fromWei = (num) => hre.ethers.utils.formatEther(num);

describe("NFTMarketplace", function() {

    let deployer, addr1, addr2, addrs, NFT, nft, Marketplace, marketplace, feePercent = 1, URI = "Sample URI";

    beforeEach(async function() {

        NFT = await hre.ethers.getContractFactory("NFT");
        Marketplace = await hre.ethers.getContractFactory("Marketplace");
        [deployer, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
        nft = await NFT.deploy();
        marketplace = await Marketplace.deploy(feePercent);

    });

    describe("Deployment", function() {

        it("Should track name and symbol of the nft collection", async function() {
            
            const nftName = "DApp NFT";
            const nftSymbol = "DAPP";
            
            expect(await nft.name()).equal(nftName);
            expect(await nft.symbol()).equal(nftSymbol);
        
        });

        it("Should track feeAccount and feePercent of the marketplace", async function() {
            expect(await marketplace.feeAccount()).equal(deployer.address);
            expect(await marketplace.feePercent()).equal(feePercent);
        });

    });

    describe("Minting NFTs", function() {

        it("Should track each minted NFT", async function() {

            await nft.connect(addr1).mint(URI)

            expect(await nft.tokenCount()).equal(1);
            expect(await nft.balanceOf(addr1.address)).equal(1);
            expect(await nft.tokenURI(1)).equal(URI);
            
            await nft.connect(addr2).mint(URI)
            
            expect(await nft.tokenCount()).equal(2);
            expect(await nft.balanceOf(addr2.address)).equal(1);
            expect(await nft.tokenURI(2)).equal(URI);
        
        });
    });

    describe("Making marketplace items", function() {
        
        let price = 1;

        beforeEach(async function() {
            await nft.connect(addr1).mint(URI)
            await nft.connect(addr1).setApprovalForAll(marketplace.address, true)
        });

        it("Should track newly created item, transfer NFT from seller to marketplace and emit Offered event", async function() {
            
            await expect(marketplace.connect(addr1).makeItem(nft.address, 1, toWei(price)))
                .emit(marketplace, "Offered")
                .withArgs(1, nft.address, 1, toWei(1), addr1.address);

            expect(await nft.ownerOf(1)).equal(marketplace.address);
            expect(await marketplace.itemCount()).equal(1);

            const item = await marketplace.items(1);

            expect(item.itemId).equal(1);
            expect(item.nft).equal(nft.address);
            expect(item.tokenId).equal(1);
            expect(item.price).equal(toWei(price));
            expect(item.sold).equal(false);
        });

        it("Should fail if price is set to zero", async function() {
            await expect (
                marketplace.connect(addr1).makeItem(nft.address, 1, 0)
            ).revertedWith("Price must be greater than zero");
        });

    });

    describe("Purchasing markplace items", function() {

        let price = 2;
        let totalPriceInWei;
        let fee = (feePercent / 100) * price;

        beforeEach(async function() {
            await nft.connect(addr1).mint(URI)
            await nft.connect(addr1).setApprovalForAll(marketplace.address, true)
            await marketplace.connect(addr1).makeItem(nft.address, 1, toWei(price))
        });
        
        it("Should update item as sold, pay seller, transfer NFT to buyer, charge fees and exit a Bought event", async function() {
            
            const sellerInitialEthBal = await addr1.getBalance();
            const feeAccountInitialEthBal = await deployer.getBalance();
            
            totalPriceInWei = await marketplace.getTotalPrice(1);

            await expect(marketplace.connect(addr2).purchaseItem(1, {value: totalPriceInWei}))
                .emit(marketplace, "Bought")
                .withArgs(1, nft.address, 1, toWei(price), addr1.address, addr2.address);

            const sellerFinalEthBal = await addr1.getBalance();
            const feeAccountFinalEthBal = await deployer.getBalance();
            
            expect((await marketplace.items(1)).sold).equal(true);
            expect(+fromWei(sellerFinalEthBal)).equal(+price + +fromWei(sellerInitialEthBal));            
            expect(+fromWei(feeAccountFinalEthBal)).equal(+fee + +fromWei(feeAccountInitialEthBal));
            expect(await nft.ownerOf(1)).equal(addr2.address);
        
        });

        it("Should fail for invalid item ids, sold items and when not enough Ether is paid.", async function() {
            
            await expect (
                marketplace.connect(addr2).purchaseItem(2, { value: totalPriceInWei })
            ).revertedWith("Item does not exist.");
        
            await expect (
                marketplace.connect(addr2).purchaseItem(0, { value: totalPriceInWei })
            ).revertedWith("Item does not exist.");

            await expect (
                marketplace.connect(addr2).purchaseItem(1, { value: toWei(price) })
            ).revertedWith("Not enough Ether to cover item price and market fee.");

            await marketplace.connect(addr2).purchaseItem(1, { value: totalPriceInWei });

            const addr3 = addrs[0];

            await expect (
                // marketplace.connect(deployer).purchaseItem(1, { value: totalPriceInWei })
                marketplace.connect(addr3).purchaseItem(1, { value: totalPriceInWei })
            ).revertedWith("Item has already been sold.");

        });

    });
})